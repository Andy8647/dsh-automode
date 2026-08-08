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

### L1 LLM classifier 设计（对齐 CC automode，规划中）

- **输入范围（防注入关键）**：只看**用户消息 + 当前 tool call**（工具名 + 参数）。**不看** assistant 的推理、回复和所有 tool 结果——恶意指令大多从 tool 输出进入上下文，排除它们就是最有效的防 prompt injection 手段。dsh 的 `tools/pre-execute` 接缝天然只提供这些信息，零额外工程
- **两阶段判定（省 token）**：Stage 1 fast 单 token 过滤（`0`=allow / `1`=审查）；只有 flagged 的调用才进 Stage 2 chain-of-thought 深查。fast 与 deep 阶段可分别配置模型（`ctx.llm` 指定任意已注册模型，如 fast 用轻量模型）
- **用户规则 = classifier 的 guidance，不是硬规则**：用户配置的 allow / soft-deny / hard-deny 规则作为输入参与判断，但 classifier 始终能看到每个调用（避免规则绕过 classifier）；硬限制仍走 L0 deny 规则
- **`ask-user` 类工具的返回不算授权**：用户在交互工具里点了"是"只帮助 agent 决策，不视为对后续动作的显式授权——显式授权必须走正常聊天消息
- **fail-closed**：超时、输出解析失败、模型不可用 → 一律转 `ask`（宁可问人，不默认放行）
- **deny 后让 agent 自行调整**：拒绝返回通用文案 + 原因给模型，模型可换更安全的方式重试（如 force push 被拒 → 改推新分支）
- **审计**：每次判定（allow/deny/ask + 理由 + 命中的规则）落 session 事件流，可回放

### 防失控：连续拒绝转人工（替代 per-turn 限额）

早期设计有过"单轮自动放行上限"的构想，调研后确认 Claude Code / Codex / pi-automode 均无此设计——计数限额是伪需求（turn 语义模糊、实现复杂、用户感知差）。可靠的防失控机制是：**连续 N 次被拒/转人工后，暂停自动放行并强制用户介入**（对齐 CC 的"持续被拒 → 暂停转人工"）。默认 N=3。

### 为什么不全交给 LLM

- **延迟**：每个 tool call 等一次模型往返会拖慢 agent 主循环；L0 是免费的，Stage 1 的单 token 过滤也很便宜
- **可靠性**：模型判定存在误判，安全边界上 fail-open 不可接受；L0 的确定性规则是安全底线
- **成本**：只对模糊地带花模型钱，且只在 Stage 1 flagged 时才花 Stage 2 的推理 token

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
  consecutiveDenyLimit: 3
```

| 配置项 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关，false 时完全旁路 |
| `denyPatterns` | 见 `src/index.ts` | 正则，命中 command 即 `deny`（硬规则，优先级最高） |
| `askPatterns` | 见 `src/index.ts` | 正则，命中 command 即 `ask` 转人工 |
| `autoApproveTools` | 只读工具列表 | tool name 白名单，直接放行 |
| `consecutiveDenyLimit` | `3` | 连续被拒/转人工 N 次后暂停自动放行，强制用户介入（防失控） |
| `classifierFastModel` | 未设置 | 规划中：L1 Stage 1 fast 过滤用模型，设置后启用 L1 |
| `classifierDeepModel` | 未设置 | 规划中：L1 Stage 2 深查用模型，默认与 fast 相同 |

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
