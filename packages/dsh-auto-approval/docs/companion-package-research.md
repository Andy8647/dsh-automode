# auto-approval client 伴侣包 + host→browser 数据通道 · 实现路径调研

> 2026-08-13,v4-pro subagent 只读调研 dsh 上游 08-12 final(`~/.dsh/source/current`)。
> 结论均已对照源码验证到行号;标 ⚠️ 的是 subagent 推断、需真机实测闭环的点。

## 结论概览

1. **client 伴侣包 = 独立 npm 包**:`dsh.client` 声明 + `exports["./client"]`,node 半是**空 apply**(占位,只为让包出现在 host Loader roster 里)。官方标准模式,plan / permission-presets / goal / model-selection 都这么拆。
2. **host→browser 三条通道,两条对第三方无 allowlist**:
   - **projection(投影)**:无 allowlist,但数据源是 session 事件 fold → 踩 `KNOWN_SESSION_EVENT_TYPES` 白名单
   - **remote 方法(推荐)**:无 allowlist,适合运行态,**不依赖 session 事件**
   - 事件转发:有 allowlist(5 个内置事件),第三方加不进
3. **auto-approval chip 用 remote 方法,不用投影**——chip 要显示"运行态"(armed 配置 + 本 turn deny 计数 + 暂停状态),投影必须从 session 事件 fold,写自定义事件正好踩我们已复现的 08-12 白名单。

## 1. 要建哪几个包

**一个新建包**(host 包 `dsh-auto-approval` 已存在,不用动):

```
@deepseek-ai/dsh-client-ui-auto-approval          ← 新建,client 伴侣包
├── package.json                                   ← dsh.client 声明
├── src/
│   ├── index.ts                                   ← node 半:空 apply(占位)
│   └── client/
│       ├── index.ts                               ← client 半:slot 注册
│       └── AutoApprovalChip.tsx                   ← 渲染组件
```

参考模板(官方 ui-plan):
- node 半 `packages/client/ui-plan/src/index.ts`(空 apply,注释:「只为让插件出现在 host cordis.yml / Loader;浏览器半走 `exports["./client"]`」)
- client 半 `packages/client/ui-plan/src/client/index.ts`
- 渲染 `packages/client/ui-plan/src/client/PlanModeControl.tsx`

## 2. manifest / package.json 关键字段

client 包 package.json(缺一 CI 报错,`scripts/verify-cordis-config.ts:116-127`):

```jsonc
{
  "name": "@deepseek-ai/dsh-client-ui-auto-approval",
  "exports": {
    "./client": {                      // ① client 入口(必须)
      "types": "./lib/types/client/index.d.ts",
      "default": "./lib/client.js"
    }
  },
  "dsh": {
    "client": {                        // ② dsh.client 声明(字段见 client/modules/src/index.ts:46)
      "platform": "web",               //    platform 必填
      "inject": [                      //    inject 可选:依赖的其他 client 包(自动装载)
        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-ui-slots"
      ],
      "immediately": false             //    可选:boot phase-one 预取,缺省 lazy
    }
  }
}
```

校验 `parseDshClient`(client/modules/src/index.ts:108-122):platform 必须 string、inject 必须 string[]、immediately 必须 boolean。

**host/client 配对不是靠 manifest 字段**,而是靠「client 包作为 host Loader entry 出现在 composition 里」。host 包 `cordis.patch.yml` 加一行即可:

```yaml
# dsh-auto-approval/cordis.patch.yml(在现有基础上加一行)
- insert:
    - id: auto-approval
      name: '@deepseek-ai/dsh-auto-approval'              # host 半(已有)
    - id: ui-auto-approval
      name: '@deepseek-ai/dsh-client-ui-auto-approval'    # client 半(新增)
```

`client-modules`(client/modules/src/index.ts:178-250)启动时扫描 host Loader 所有 entries,对有 `dsh.client` 声明的 → serve `/plugins/<id>/client.js` 并注入 boot graph。「出现在 roster + 有 dsh.client 声明」是充分条件。

## 3. 数据通道

### 3a. projection —— 无 allowlist,但数据源 = session 事件(不推荐)

- key 声明(module augmentation,任何包都能做):`packages/plan/plan-mode/src/types.ts:23-26`
- 注册:`ctx.inject(['sessionProjections'], ...)` → `sessionProjections.register({ key, schema, init, apply, view, stateVersion })`,`packages/session/session-projection/src/index.ts:194`
- serve 无 allowlist:`packages/host/apiproxy/src/api-proxy.ts:785-788`(`projectionsFor()` = registry.snapshot,任何注册的 key 都进)
- ⚠️ 关键限制:投影值只能从 session 事件 fold → 写自定义事件踩 08-12 白名单

### 3b. remote 方法 —— 无 allowlist,适合运行态(推荐)

host 服务继承 `TypertRemoteService` + 方法加 `@Remote`(`packages/typert/protocol/src/index.ts:128,149`):

```ts
export class AutoApprovalStatusService extends TypertRemoteService {
  constructor(ctx: Context) { super(ctx, 'autoApproval') }  // serviceKey = wire namespace
  @Remote
  getStatus(sessionId: string): { armed: boolean; denyCount: number; paused: boolean } {
    // 直接读 host 内存态(tracker + config),不落 session 事件
  }
}
```

client 侧 `ctx.remote.autoApproval.getStatus(sessionId)`。gateway 通过反射收集 `@Remote` 方法(`packages/api/gateway/src/index.ts:120-145`)。

### 3c. 事件转发 —— 有 allowlist(排除)

`packages/api/remotes/src/remote-events.ts:17-22` 仅 5 个内置事件,第三方加不进。

## 4. slot 注册代码模式

client 半模板(`packages/client/ui-plan/src/client/index.ts:43-68`):

```ts
export const inject = ['slots', 'remote', 'remote.autoApproval', 'locale']
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('autoApproval', { zh, en }))
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    locale: 'autoApproval',
    inject: (sessionId: SessionId) => ({ getStatus: () => ctx.remote.autoApproval.getStatus(sessionId) }),
  }, AutoApprovalChip))
}
```

slot 位置(`packages/client/ui-conversation/src/client/contract/slots.ts`):
- `conversation.input.left`(list,:134)/ `conversation.input.right`(list,:136)—— 我们该用的,可塞任意多个插件
- `conversation.input.plan`(single,:157)—— plan 专属,别占
- 布局 `InputBar.tsx:750`:权限选择器(:562)后紧跟 renderSlot(plan),再跟 leftItems

## 5. 关键上游文件路径

| 用途 | 文件:行 |
|---|---|
| dsh.client 声明字段 | `packages/client/modules/src/index.ts:46` |
| dsh.client 校验 | `packages/client/modules/src/index.ts:108-122` |
| client roster 扫描 + serve | `packages/client/modules/src/index.ts:178-250` |
| manifest 双面校验(CI) | `scripts/verify-cordis-config.ts:116-127` |
| 投影 register API | `packages/session/session-projection/src/index.ts:194` |
| 投影 key 声明(module augmentation) | `packages/plan/plan-mode/src/types.ts:23-26` |
| 投影注册示例(host 半) | `packages/plan/plan-mode/src/index.ts:244-245` |
| 投影 serve(无 allowlist) | `packages/host/apiproxy/src/api-proxy.ts:785-788` |
| 事件转发 allowlist | `packages/api/remotes/src/remote-events.ts:17-22` |
| TypertRemoteService / @Remote | `packages/typert/protocol/src/index.ts:128,149` |
| remote 反射收集 | `packages/api/gateway/src/index.ts:120-145` |
| slot 声明(plan/left/right) | `packages/client/ui-conversation/src/client/contract/slots.ts:130,134,136,157` |
| slot 注册示例(client 半) | `packages/client/ui-plan/src/client/index.ts:43,52` |
| chip 渲染 + useProjection | `packages/client/ui-plan/src/client/PlanModeControl.tsx` |
| 权限选择器布局 | `packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:562,750` |

## 6. blocker / 待实测闭环

1. **【关键】投影依赖自定义 session 事件 → 踩 `KNOWN_SESSION_EVENT_TYPES` 白名单**(已实机复现)→ chip 动态状态走 **remote 方法**而非投影
2. **事件转发 allowlist** 仅 5 个事件 → 第三方无法推自定义事件到 client(影响"实时推送",remote 需 client 轮询)
3. **settings namespace allowlist**(#349/#410):chip 若想带「点开配置」仍受限;纯状态 chip 不依赖
4. ⚠️ **remote 方法 stage-3 decorators**:上游用 stage-3,我们包的 tsconfig 需确认支持
5. ⚠️ **装配路径**:client 包经 `dsh plugin --profile add` 的 bundle.patch insert 是否被 reconcile 一并纳入 roster,**尚未真机验证**(唯一没 100% 闭环的点)

## 落点决策(待用户拍板)

- 数据通道:**remote 方法**(TypertRemoteService + @Remote)读 host 运行态,不写 session 事件
- UI 位置:`conversation.input.left` list slot,权限选择器旁
- 新包:`@deepseek-ai/dsh-client-ui-auto-approval`(node 半空 apply + client 半 slot 注册)
- 动手前先真机验证第 5 点(装配路径)
