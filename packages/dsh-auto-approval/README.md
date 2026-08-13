# dsh-auto-approval

DSH 权限自动审批插件：为 approval policy 引入第三档 `auto`，用 classifier 对每个 tool call 做 **allow / deny / ask** 三态决策，再派发执行。

对标 Claude Code automode / Codex "approve for me" 的能力，但决策粒度更细——不是二元的"自动放行/全停"，而是：

| 决策 | 行为 | 场景 |
|---|---|---|
| `allow` | 直接放行，不等用户 | 只读工具、低风险命令 |
| `deny` | 返回 `Error: <reason>`，模型收到拒绝 | 明确危险的命令（黑名单） |
| `ask` | 转 `ctx.approval` 问用户 | 拿不准的操作（灰名单） |

## 工作原理

挂在 `tools/pre-execute` 瀑布**最前**（`prepend: true`），对所有 tool call 先过 classifier 再派发。dsh tools 瀑布原生支持三态决策（`PreToolDecision`），本插件只是把决策逻辑注入进去，不改任何内核代码。

```
model → tools/pre-execute waterfall
         └─ dsh-auto-approval (prepend, 最先跑)
              ├─ deny  → 直接变 Error 结果
              ├─ ask   → ctx.approval.request() 问用户
              └─ allow → next() 委托下游（默认行为）
```

与 dsh 原生 sandbox escalation 的关系：两层审批并存、互不替代——沙箱管"文件效应越界"，本插件管"调用本身的危险性"。检测到调用携带 escalation 参数（`sandbox_permissions` + `justification`）时，本插件跳过 ask 规则与 L1 直接放行，把审批留给 escalation 自己的通道，避免双重审批（L0 deny 硬底线不受此豁免）。

硬性保证：

- **L0 deny 双保险**：deny 规则除瀑布 listener 外还注册为 `ctx.tools.guard()` 单调 guard——在所有 pre-execute listener 之后执行，只能 deny 不能 allow，其它 prepend 插件旁路不掉
- **自毁护栏**：`killall` / `pkill` / `taskkill` / `Stop-Process` **整类**终止命令（不管目标——`pkill -f` 匹配命令行，`pkill -f dsh`/`pkill -f auto-approval` 可绕过 node 名过滤直击宿主），以及 `kill <宿主PID>`，在 L0 硬底线直接 deny（`selfKillGuard`，默认开）——模型误发清理命令时不会把自己跑的环境杀掉。清理遗留进程走逃生通道：`kill <具体PID>` 只要不是宿主进程就放行，deny 文案会提示宿主 PID
- **reason 不泄露规则**：deny/ask 返回给模型的是通用文案，命中的 pattern 只进审计事件和日志
- **配置 fail-loud**：非法正则、不成对的 provider/model 在插件加载时直接 throw，不在运行时静默降级
- **防失控**：同一 turn 内连续被 deny 达 `consecutiveDenyLimit`（默认 3）后暂停自动放行，本 turn 内一律转人工；turn 边界从 session log 的 `turn/start` 事件推导，新 turn 自动恢复。无 agent 的调用不参与计数

## 方案设计

设计对齐 Claude Code automode 的"意图对齐"思路：classifier 判断**这个动作是否符合用户意图**（而不是单纯看命令危不危险），并借鉴其两阶段判定与防注入原则。同时保留 dsh 的确定性硬底线（L0 规则）与 fail-closed 传统。

### 三层 classifier 架构

| 层 | 职责 | 成本 | 默认 |
|---|---|---|---|
| **L0 规则引擎（硬规则）** | deny/ask 黑名单——确定性底线，永不交给模型裁决；allow 白名单（只读工具）直接放行 | 零，确定性 | ✅ 开 |
| **L1 LLM classifier（意图对齐）** | 模糊地带：把用户消息 + 本次 tool call 喂给模型，判断动作是否在用户意图范围内 | 每次判定一次模型调用 | ⚪ 关（配置模型后启用） |
| **L2 人工兜底** | `ask` 转 `ctx.approval` 问用户 | — | 常备 |

决策优先级：**L0 deny > L1 判定 > L2 人工**。L0 命中的 deny 不经过 L1；L1 判定失败时 fail-closed 转 `ask`，绝不默认放行。

```
tool call ──→ L0 规则引擎（硬规则）
              ├─ deny    → 直接拒绝（Error: <reason>）
              ├─ 白名单 → allow（next() 放行）
              └─ 未命中 ──→ L1 LLM classifier（未启用则直接 allow）
                            ├─ deny → 拒绝（reason 回给模型，可自行调整）
                            ├─ ask  → L2 ctx.approval 问用户
                            ├─ allow → 放行
                            └─ 超时/解析失败 → fail-closed 转 ask
```

### L1 LLM classifier 设计（对齐 CC automode，已实现）

- **输入范围（防注入关键）**：只看**用户消息 + 当前 tool call**（工具名 + 参数）。**不看** assistant 的推理、回复和所有 tool 结果——恶意指令大多从 tool 输出进入上下文，排除它们就是最有效的防 prompt injection 手段。dsh 的 `tools/pre-execute` 接缝天然只提供这些信息，零额外工程
- **两阶段判定（省 token）**：Stage 1 fast 单 token 过滤（`0`=allow / `1`=审查）；只有 flagged 的调用才进 Stage 2 chain-of-thought 深查。fast 与 deep 阶段可分别配置模型（`ctx.llm` 指定任意已注册模型，如 fast 用轻量模型）
- **用户规则 = classifier 的 guidance，不是硬规则**：用户配置的 allow / soft-deny / hard-deny 规则作为输入参与判断，但 classifier 始终能看到每个调用（避免规则绕过 classifier）；硬限制仍走 L0 deny 规则
- **`ask-user` 类工具的返回不算授权**：用户在交互工具里点了"是"只帮助 agent 决策，不视为对后续动作的显式授权——显式授权必须走正常聊天消息
- **fail-closed**：超时、输出解析失败、模型不可用 → 一律转 `ask`（宁可问人，不默认放行）
- **deny 后让 agent 自行调整**：拒绝返回通用文案 + 原因给模型，模型可换更安全的方式重试（如 force push 被拒 → 改推新分支）
- **审计**：每次判定（allow/deny/ask + 理由 + 命中的规则）落独立决策日志 `~/.dsh/logs/auto-approval.log`（始终）；session 事件写入默认关（`auditSessionEvents`，08-12 final 起写 session 事件会使日志无法打开）

### 防失控：连续拒绝转人工（替代 per-turn 限额）

早期设计有过"单轮自动放行上限"的构想，调研后确认 Claude Code / Codex / pi-automode 均无此设计——计数限额是伪需求（turn 语义模糊、实现复杂、用户感知差）。可靠的防失控机制是：**连续 N 次被拒/转人工后，暂停自动放行并强制用户介入**（对齐 CC 的"持续被拒 → 暂停转人工"）。默认 N=3。

### 为什么不全交给 LLM

- **延迟**：每个 tool call 等一次模型往返会拖慢 agent 主循环；L0 是免费的，Stage 1 的单 token 过滤也很便宜
- **可靠性**：模型判定存在误判，安全边界上 fail-open 不可接受；L0 的确定性规则是安全底线
- **成本**：只对模糊地带花模型钱，且只在 Stage 1 flagged 时才花 Stage 2 的推理 token

# Install

**前置**：已装 dsh（内测版）。插件通过 dsh 的 profile 系统安装，不碰 dsh 本体。

插件**未发布 npm**（内测期），仓库已提交构建产物（`lib/`），**clone 后直接可用，无需自己构建**。运行时依赖（`@deepseek-ai/*`）由 dsh 本体提供，只需 `schemastery` 一个 npm 包（安装时自动处理）。

## 方式 A：直接安装（推荐，无需构建）

```sh
# 1. clone（私有仓库，需 dsh-external org 成员）
gh repo clone dsh-external/dsh-auto-approval

# 2. 装到你的 profile（用已有可用的 profile，如 web；<你的clone路径> 换成实际位置）
#    ⚠️ 避免新建 profile：新 profile 默认只有 base 层，没有 UI，启动会静默挂起
dsh plugin --profile web add link:/<你的clone路径>/dsh-auto-approval

# 3. 重启 dsh
```

## 方式 B：源码构建（开发/改代码）

构建需要 dsh monorepo 的构建产物（`@deepseek-ai/*` 包未发布 npm，`devDependencies` 用 `file:` 指向 monorepo）：

```sh
# 1. clone dsh monorepo 并构建
gh repo clone dsh2026/test-Andy8647
cd test-Andy8647 && pnpm install && pnpm run build

# 2. 把插件的 devDependencies 里 file: 路径指到你的 monorepo
#    （默认 ../../test-Andy8647/packages/...，按你的 clone 位置改）
cd <你的clone路径>/dsh-auto-approval
pnpm install && pnpm run build

# 3. 同方式 A 安装 + 重启
```

## 配置

所有配置走 `$DSH_HOME/settings.yaml`（默认 `~/.dsh/settings.yaml`；`DSH_HOME` 环境变量可改位置）。加一个 `auto-approval:` section：

```yaml
auto-approval:
  enabled: true
  denyPatterns:
    - 'rm\s+(-[a-z]*[fr][a-z]*\s+)*/\s*$'
  # 其余字段见下方「配置」表
```

配置**热重载**（watch 文件），改完即生效，无需重启。

## 验证是否装好

1. 重启后 `$DSH_HOME/logs/auto-approval.log` 首行应有 `auto-approval/armed`（含规则数、L1 状态）——没有这行就是插件没加载
2. 让模型跑 `echo danger_test`（需先配同名的 deny 规则），应被拒绝，日志出现 `L0-deny`
3. 或直接查会话审计：`zstd -dc <session.jsonl.zstd> | rg auto-approval`

## 配置

```yaml
# settings.yaml
auto-approval:
  enabled: true
  denyPatterns:
    - 'rm\s+(-[a-z]*[fr][a-z]*\s+)*/\s*$'
    - 'curl\s+[^|]*\|\s*(ba)?sh'
  askPatterns:
    - 'sudo\s'
    - 'git\s+push\s+--force'
  autoApproveTools:
    - read
    - grep
    - find
  consecutiveDenyLimit: 3
  # 可选：启用 L1 LLM classifier（不配则不启用，L0 未命中即 allow）
  # classifierFastProvider: deepseek
  # classifierFastModel: deepseek-chat
  # classifierDeepProvider: deepseek   # 缺省沿用 fast
  # classifierDeepModel: deepseek-reasoner
  # classifierTimeoutMs: 10000
  # classifierGuidance: '不允许任何网络外联调用'
```

| 配置项 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关，false 时完全旁路 |
| `denyPatterns` | 见 `src/config.ts` | 正则，命中 command/code 即 `deny`（硬规则，优先级最高） |
| `askPatterns` | 见 `src/config.ts` | 正则，命中 command/code 即 `ask` 转人工 |
| `autoApproveTools` | 只读工具列表 | tool name 白名单，直接放行 |
| `bashCommandPrefixes` | 空 | bash 命令前缀白名单：以这些前缀开头且不含 shell 元字符（`\|` `>` `<` `;` `&` 反引号 `$(`）的 bash 命令跳过 L1 直接放行。tool 名白名单豁免不了 bash 子命令（`ls`/`cat` 都走 `bash` tool），这是只读 shell 命令的唯一免 L1 通道 |
| `selfKillGuard` | `true` | 自毁护栏：拦截 `killall` / `pkill` / `taskkill` / `Stop-Process` 整类终止命令（目标不可控，`pkill -f <模式>` 可直击宿主命令行）及 `kill <宿主PID>`，L0 硬底线 deny。清理遗留进程用 `kill <具体PID>`（非宿主进程放行），deny 文案会提示宿主 PID |
| `auditSessionEvents` | `false` | 是否把每次判定写入 session 事件（`auto-approval/decision`）。**默认关**：08-12 final 起 session 读取对未声明事件类型 fail-closed（`KNOWN_SESSION_EVENT_TYPES` 白名单，`Session.append()` 无 ignorable 通道），写 session 事件会使该 session 重启后无法打开。文件审计日志 `~/.dsh/logs/auto-approval.log` 始终记录，不受影响 |
| `consecutiveDenyLimit` | `3` | 同一 turn 内累计被 deny N 次后暂停自动放行，强制用户介入（防失控；按 turn 计数，下条用户消息清零——注意是"回合内累计"不是"连续"） |
| `classifierFastProvider` / `classifierFastModel` | 未设置 | L1 Stage 1 fast 过滤的模型路由（须成对）；设置后启用 L1 |
| `classifierDeepProvider` / `classifierDeepModel` | 未设置 | L1 Stage 2 深查的模型路由（须成对），缺省沿用 fast |
| `classifierTimeoutMs` | `20000` | L1 单次模型调用超时，超时 fail-closed 转 ask |
| `classifierGuidance` | 未设置 | 用户自定义判定准则，作为 guidance 注入 L1 prompt（非硬规则） |

## 审计

每次判定落可观测记录（best-effort，失败只 warn，不影响审批决策）：

1. **独立决策日志** `$DSH_HOME/logs/auto-approval.log`（默认 `~/.dsh/logs/auto-approval.log`）：每行一条 JSON。首行是 `auto-approval/armed` 配置摘要（直接回答「插件是否启用、规则数、L1 是否开」），之后每条是判定。UI 无通道渲染插件决策（host api-proxy 暴露白名单 + client toolviews 硬编码），文件日志是唯一不依赖 UI 的观测手段。查法：

```sh
tail -f ~/.dsh/logs/auto-approval.log
```

2. **session 事件** `auto-approval/decision`（log-only，不进模型历史），默认关（`auditSessionEvents: true` 开启）：tool、callId、stage、decision、命中的 pattern、L1 路由与耗时。⚠️ **08-12 final 起默认关闭**——session 读取对未声明事件类型 fail-closed（`KNOWN_SESSION_EVENT_TYPES` 白名单 + `Session.append()` 无 ignorable 通道），写自定义事件会使该 session 重启后无法打开；官方 registration surface 落地前请保持关闭。查法（仅 `auditSessionEvents: true` 的 session）：

```sh
zstd -dc ~/.dsh/sessions/--*/session-*/session.jsonl.zstd | rg auto-approval
```

## 真机验证（2026-08-08，Web 会话，approval policy=ask + workspace-write 沙箱）

### L0 三用例（首次验证）

| 用例 | 审计记录 | 结果 |
|---|---|---|
| `echo danger_test`（测试 deny 规则） | `L0-deny · deny · pattern: echo\s+danger_test` | ✅ 模型收到 deny 错误，拒绝执行 |
| `sudo echo hi` | `L0-ask · ask · pattern: sudo\s` → 用户批准 → 沙箱拦 exec → escalation 重试 → `escalation-bypass · allow` | ✅ 审批链路走通；sudo 无 TTY 失败（exit 1） |
| `ls` 等常规命令 | `default-allow · allow` | ✅ 未命中规则直接放行 |

### L1 六用例（2026-08-09，classifier 路由 deepseek-official/deepseek-v4-flash）

| # | 命令 | 实际判定 | 结果 |
|---|---|---|---|
| 1 | `echo hello` | `L1-fast · allow`（1069ms） | ✅ |
| 2 | `date ...` | `L1-fast · allow`（1944ms） | ✅ |
| 3 | `mkdir && printf > hello.txt` | `L1-deep · allow`（4257ms，rationale: "local, reversible, matches intent"） | ✅ |
| 4 | `rm -rf /tmp/dsh-l1-test` | deep 超时 → fail-closed ask（人工兜底，安全方向） | ✅ |
| 5 | `echo danger_test` | `L0-deny`（未进 L1） | ✅ |
| 6 | `ls -la` | 走 L1-fast（当时无 bash 前缀白名单；已加 `bashCommandPrefixes` 解决） | ⚠️→已修 |

要点：

- **两层防线分工**：插件管「调用危险不危险」（pre-execute），沙箱管「文件效应越界」（exec 权限）。system 级命令即使过了插件与审批，workspace-write 沙箱仍拦 exec，需升级 danger-full-access。
- **escalation-bypass（M5）**：带 sandbox 升级参数的调用不再重复走 ask/L1——人已在 escalation 审批中批准，避免双重弹窗。
- **规则漏网案例**：`rm -rf ./*` 曾被默认规则 `rm\s+.../\s*$` 放过（只匹配以 `/` 结尾）。已补 `rm\s+(-[a-z]*[fr][a-z]*\s+)*(\./)?\*\s*$` 与 `rm\s+(-[a-z]*[fr][a-z]*\s+)*\.\/?\s*$`（覆盖 `rm -rf ./*` / `rm -rf *` / `rm -rf .` / `rm -rf ./`，不误伤 `rm -rf foo/`）。**pattern 匹配 command 全文**，`echo rm -rf ./*` 这类打印也会命中（保守方向，fail-closed）。
- **真机踩坑（两次修复）**：① fast `maxTokens=8` 对 v4-flash 不够——模型输出解释文本被截断，finish=max-tokens → extractText 抛错 → 全 fail-closed。修复：fast 接受截断收尾（只看首字符）+ maxTokens 提到 16。② classifier 调用继承了 api-gateway 的 `reasoningEffort: max`——v4-flash 的 reasoning token 吃满 maxTokens（fast 16 / deep 512 都被截断）。修复：classifier 强制 `reasoningEffort: off`（判定调用不需要推理链）+ deep 接受截断收尾（VERDICT 行存活即成功）+ deep maxTokens 768。
- **deny 后模型长时间思考**：旧 deny 文案「choose a safer alternative or ask」是开放决策——v4-flash 面对「为什么被拒（pattern 隐藏）+ 替代方案可能不存在」会陷入长时间 reasoning。已改为「report the denial and ask the user」，把模型行为收窄成确定动作。

## 已知限制

- **Web UI 设置页无 section**：host `api-proxy` 的 `exposedNamespaces()` 硬编码白名单（`permission` / `ui-onboarding` / 可配置模型 provider），第三方插件的 settings namespace 默认不暴露给配置客户端；且设置页 section 是 client 侧 slots 注册制，需要配套 dshClient 伴侣包。配置请走 `settings.yaml`（热重载）。计划向 dsh-external/issues 提 issue 请求开放暴露通道。
- **settings.yaml 的 section 是整体替换**（数组不合并）：覆盖某字段需完整列出。
- **L1 未真机验证**：见上。

## 开发

dsh 包尚未发布 npm（内测期），本地开发用 `file:` 链接上游 monorepo 的**构建产物**（`devDependencies` 指向 `../../test-Andy8647/packages/...`，相对路径按你的 clone 位置调整）：

```sh
# 1. 先构建上游 monorepo（产出各包的 lib/，本插件的类型与运行时都依赖它）
cd ~/Projects/DeepSeek/test-Andy8647 && pnpm install && pnpm run build

# 2. 安装本插件依赖（pnpm-workspace.yaml 已设 autoInstallPeers: false——
#    dsh 包的 peerDeps 不在 npm 上，不能自动安装）
cd ~/Projects/DeepSeek/plugins/dsh-auto-approval && pnpm install

# 3. 类型检查 / 测试 / 构建
pnpm run typecheck   # tsc strict（含 noUncheckedIndexedAccess / exactOptionalPropertyTypes）
pnpm run test        # vitest，40 个用例：规则引擎 / tracker / L1 / cordis 集成
pnpm run build       # tsc 产出 lib/types → tsdown 打包 lib/index.js
```

注意：不要试图把本包 symlink 进 monorepo 的 `packages/*/*/`——pnpm install 会把 realpath 在工作区外的 symlink 包排除出安装（`pnpm ls -r` 能看到但 lockfile 与 node_modules 都不会有它），`file:` 链接是验证过的路径。

## License

BSD-3-Clause
