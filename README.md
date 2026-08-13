# dsh-auto-approval

DSH 权限自动审批插件 —— 给 approval policy 加第三档 `auto`，classifier 对每个 tool call 做 **allow / deny / ask** 三态决策。

这是一个 monorepo，两个包：

| 包 | 作用 |
|---|---|
| [`packages/dsh-auto-approval`](./packages/dsh-auto-approval) | **host 半**：pre-execute 分类器（L0 规则 + L1 LLM + L2 人工） |
| [`packages/dsh-client-ui-auto-approval`](./packages/dsh-client-ui-auto-approval) | **client 半**：聊天输入栏权限选择器旁的状态 chip，走 Typert remote 显示实时 deny 计数 |

## 安装

两个包都装到同一个 profile：

```sh
gh repo clone dsh-external/dsh-auto-approval

# host 半
dsh plugin --profile web add link:/<你的clone路径>/dsh-auto-approval/packages/dsh-auto-approval
# client 半（可选，要状态 chip 才装）
dsh plugin --profile web add link:/<你的clone路径>/dsh-auto-approval/packages/dsh-client-ui-auto-approval
```

配置与用法见 [host 包 README](./packages/dsh-auto-approval)。

## 开发

```sh
pnpm install          # 需 export NPM_TOKEN=$(cat ~/.dsh/npm-token)
pnpm -r run build     # 两个包都构建
pnpm -r run test      # host 单测
```

## License

BSD-3-Clause
