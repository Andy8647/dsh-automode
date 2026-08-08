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

与 dsh 原生 sandbox escalation 的关系：两层审批并存、互不替代——沙箱管"文件效应越界"，本插件管"调用本身的危险性"。

## 安装

```sh
dsh plugin --profile <name> add @deepseek-ai/dsh-auto-approval
```

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
  maxAutoApprovePerTurn: 20
```

| 配置项 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关，false 时完全旁路 |
| `denyPatterns` | 见 `src/index.ts` | 正则，命中 command 即 `deny`（优先级最高） |
| `askPatterns` | 见 `src/index.ts` | 正则，命中 command 即 `ask` 转人工 |
| `autoApproveTools` | 只读工具列表 | tool name 白名单，直接放行 |
| `maxAutoApprovePerTurn` | `20` | 单 turn 自动放行上限，超出一律 `ask` |

## 开发

dsh 包尚未发布 npm（内测期），本地开发需链接上游 monorepo：

```sh
# 方案 A：把本包塞进 monorepo workspaces 开发
ln -s ~/Projects/DeepSeek/plugins/dsh-auto-approval ~/Projects/DeepSeek/test-Andy8647/packages/examples/dsh-auto-approval
cd ~/Projects/DeepSeek/test-Andy8647 && pnpm install && pnpm --filter @deepseek-ai/dsh-auto-approval run build

# 方案 B：独立开发，用 file: 指向本地包
pnpm add -D @deepseek-ai/dsh-tools@file:~/Projects/DeepSeek/test-Andy8647/packages/core/tools
```

构建：`pnpm run build`（tsc 产出声明 → tsdown 打包 ESM）。

## Roadmap

- [x] 抢注 repo + 插件骨架（pre-execute 挂点、三态决策、规则引擎 v1）
- [ ] classifier 升级：LLM 判定（把 exec.name + arguments 喂模型打分）替代纯正则
- [ ] 按 turn 重置的放行计数（挂 `turn/start` 事件）
- [ ] 审计日志：每次 allow/deny/ask 落 session 事件流
- [ ] 与 `dsh-plan-execute` 协同的完整"autopilot"体验

## License

BSD-3-Clause
