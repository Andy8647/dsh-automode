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

## 方案设计

### 三层 classifier 架构

安全决策不全部交给单一机制：规则引擎兜住"显然危险"的硬底线（确定性、零延迟、可审计），LLM 只负责模糊地带，人工是最终兜底。

| 层 | 职责 | 成本 | 默认 |
|---|---|---|---|
| **L0 规则引擎** | deny 黑名单（`rm -rf /`、`curl\|sh` 等）——显然危险的操作**永不**交给模型裁决；allow 白名单（只读工具）直接放行 | 零，确定性 | ✅ 开 |
| **L1 LLM classifier** | 模糊地带："这个 `npm install` 到底装了什么"、奇怪的 `git push`——把调用信息喂给模型，输出三态 JSON | 每次判定一次模型调用 | ⚪ 关（配置模型后启用） |
| **L2 人工兜底** | `ask` 转 `ctx.approval` 问用户 | — | 常备 |

决策优先级：**deny > ask > allow**。L0 命中的 deny 不经过 L1；L1 判定失败时 fail-closed 转 `ask`，绝不默认放行。

```
tool call ──→ L0 规则引擎
              ├─ deny    → 直接拒绝（Error: <reason>）
              ├─ 白名单 → allow（next() 放行）
              └─ 未命中 ──→ L1 LLM classifier（未启用则直接 allow）
                            ├─ deny → 拒绝
                            ├─ ask  → L2 ctx.approval 问用户
                            ├─ allow → 放行
                            └─ 超时/解析失败 → fail-closed 转 ask
```

### 为什么不全交给 LLM

- **延迟**：每个 tool call 等一次模型往返会拖慢 agent 主循环；L0 是免费的
- **可靠性**：模型判定存在误判，安全边界上 fail-open 不可接受；L0 的确定性规则是安全底线
- **成本**：只对模糊地带花模型钱，而不是每个调用都花

### L1 LLM classifier 设计（规划中）

- **可配置模型**：`classifierModel` 指定任意已注册模型 id（profile 里配了哪些 provider 就能用哪些），走 `ctx.llm`，用户可自选 fast/cheap 模型
- **判定预算**：单次判定 2s 超时；超时或输出解析失败 → fail-closed 转 `ask`（宁可问人，不默认放行）
- **输出约束**：模型只返回 `{"decision":"allow|deny|ask","reason":"..."}` 单行 JSON，解析失败即 fail-closed
- **缓存节流**：同一命令的判定结果缓存，避免重复调用刷模型
- **审计**：每次判定（allow/deny/ask + 理由）落 session 事件流，可回放

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
| `classifierModel` | 未设置 | 规划中：L1 LLM classifier 使用的模型 id，设置后启用 L1 |
| `classifierTimeoutMs` | `2000` | 规划中：L1 单次判定超时，超时 fail-closed 转 `ask` |

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

## License

BSD-3-Clause
