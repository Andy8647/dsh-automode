# dsh-auto-approval

DSH 权限自动审批插件：给 approval policy 加第三档 `auto`，classifier 对每个 tool call 做 **allow / deny / ask** 三态决策，再派发执行。对标 Claude Code automode / Codex "approve for me"。

> 这是 **host 半**。想在聊天输入栏看到实时状态 chip（"AA on" / deny 计数），装 [dsh-client-ui-auto-approval](../dsh-client-ui-auto-approval)（client 半）。

## 工作原理

挂在 `tools/pre-execute` 瀑布最前（`prepend: true`），决策优先级 **L0 deny > L1 判定 > L2 人工**：

| 层 | 职责 | 默认 |
|---|---|---|
| **L0 规则引擎** | deny/ask 黑名单（硬底线）+ 只读工具白名单，确定性、零成本 | ✅ 开 |
| **L1 LLM classifier** | 模糊地带：用户消息 + 当前 tool call 喂模型判意图（两阶段 fast→deep） | ⚪ 关 |
| **L2 人工兜底** | `ask` 转 `ctx.approval` 问用户 | 常备 |

硬保证：L0 deny 双保险（瀑布 listener + `ctx.tools.guard()` 单调 guard）、自毁护栏（`killall`/`pkill`/`taskkill`/`Stop-Process` 整类 deny，逃生通道 `kill <具体PID>`）、reason 不泄露规则、配置 fail-loud、连续 deny 达 `consecutiveDenyLimit`（默认 3）暂停自动放行。

与沙箱 escalation 的关系：两层审批并存——沙箱管文件效应越界，本插件管调用本身危险性；带 escalation 参数的调用跳过 ask/L1（L0 deny 不豁免），避免双重审批。

## 安装

插件**未发布 npm**，仓库已提交构建产物（`lib/`），clone 后直接可用。运行时依赖 `@deepseek-ai/*` 由 dsh 本体提供。

```sh
# 1. clone
gh repo clone dsh-external/dsh-auto-approval

# 2. 装到已有可用的 profile（⚠️ 别新建 profile：默认只有 base 层、无 UI，会静默挂起）
dsh plugin --profile web add link:/<你的clone路径>/dsh-auto-approval/packages/dsh-auto-approval

# 3. 重启 dsh
```

## 配置

走 `$DSH_HOME/settings.yaml`（默认 `~/.dsh/settings.yaml`），热重载，改完即生效：

```yaml
auto-approval:
  enabled: true
  denyPatterns:
    - 'rm\s+(-[a-z]*[fr][a-z]*\s+)*/\s*$'
    - 'curl\s+[^|]*\|\s*(ba)?sh'
  askPatterns:
    - 'sudo\s'
    - 'git\s+push\s+--force'
  autoApproveTools: [read, grep, find]
  consecutiveDenyLimit: 3
  # 启用 L1（不配则不启用，L0 未命中即 allow）
  # classifierFastProvider: deepseek
  # classifierFastModel: deepseek-chat
  # classifierDeepProvider: deepseek   # 缺省沿用 fast
  # classifierDeepModel: deepseek-reasoner
```

| 配置项 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `denyPatterns` | 见 `src/config.ts` | 正则，命中即 deny（硬规则） |
| `askPatterns` | 见 `src/config.ts` | 正则，命中即 ask 转人工 |
| `autoApproveTools` | 只读工具列表 | tool name 白名单 |
| `bashCommandPrefixes` | 空 | bash 前缀白名单（`ls`/`cat` 都走 bash tool，tool 白名单豁免不了，这是只读 shell 命令免 L1 的通道） |
| `selfKillGuard` | `true` | 自毁护栏，见上 |
| `auditSessionEvents` | `false` | 是否写 session 事件。**保持关**：08-12 final 起 session 对未声明事件 fail-closed，开了 session 重启打不开 |
| `consecutiveDenyLimit` | `3` | 回合内累计 deny 达 N 次后暂停自动放行 |
| `classifierFastProvider` / `classifierFastModel` | 未设置 | L1 fast 模型路由（成对，设置后启用 L1） |
| `classifierDeepProvider` / `classifierDeepModel` | 未设置 | L1 deep 模型路由（成对，缺省沿用 fast） |
| `classifierTimeoutMs` | `20000` | L1 单次超时，fail-closed 转 ask |
| `classifierGuidance` | 未设置 | 自定义判定准则（guidance，非硬规则） |

## 审计

每次判定落 `$DSH_HOME/logs/auto-approval.log`（每行 JSON，首行是 `armed` 配置摘要）：

```sh
tail -f ~/.dsh/logs/auto-approval.log
```

## 验证

1. 重启后 `~/.dsh/logs/auto-approval.log` 首行应是 `auto-approval/armed`
2. 让模型跑 `echo danger_test`（配同名 deny 规则），应被拒，日志出现 `L0-deny`

## 已知限制

- **Web UI 设置页无 section**：host api-proxy 的 `exposedNamespaces()` 是硬编码白名单，第三方 settings namespace 默认不暴露。配置走 `settings.yaml`（热重载）。已在 dsh-external/issues 提 issue（#485，已并入 #349）。
- **settings.yaml 的 section 整体替换**（数组不合并），覆盖某字段需完整列出。

## 开发

```sh
# repo 根（monorepo，host + client 两个包）
pnpm install          # 需 export NPM_TOKEN=$(cat ~/.dsh/npm-token)
pnpm run typecheck    # tsc strict
pnpm run test         # vitest
pnpm run build        # tsc → tsdown
```

依赖已从 npm 私有 registry 安装（rc.5 系），不再需要 `file:` 链接 monorepo 构建产物。

## License

BSD-3-Clause
