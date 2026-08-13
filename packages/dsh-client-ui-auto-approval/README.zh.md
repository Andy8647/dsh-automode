# dsh-client-ui-auto-approval

[English](../README.md) | [中文](../README.zh.md)

dsh-auto-approval 的 **client 伴侣包**：在聊天输入栏权限选择器（Read Only / Workspace Write / Full access）旁显示一个状态 chip，实时展示 host 侧 auto-approval 的运行态 —— armed 配置、本 turn 的 deny 计数、**累计统计（approved / denied）**、暂停状态。

```
[Access mode: Workspace Write]  ● AA on   [Select model...]
```

## 交互

- **hover chip**：tooltip 显示完整状态——L0 规则数、L1 路由、累计统计（✓ approved · ✗ denied）、暂停/本 turn deny 计数。
- **点击 chip**：弹出对话框——
  - **开关**：Turn on/off（走 host `setEnabled` remote，优先写 settings 持久化，热生效且重启后保持）；
  - **累计统计**：两张数字卡（Approved / Denied）；
  - **决策表格**：本 session 最近 100 条决策（时间、工具、阶段、结论、命中的 pattern / L1 rationale），新→旧，弹窗打开时每 2s 刷新。

## 工作原理

数据走 Typert remote（`autoApprovalStatus/getStatus` + `getHistory` + `setEnabled`），host 半的 `AutoApprovalStatusService` 读内存态（resolved 配置 + deny tracker + DecisionHistory 环形缓冲），不落 session 事件。

> 不用 projection 的原因：projection 值必须从 session 事件 fold，而 08-12 final 起写自定义 session 事件会使 session 重启后打不开（`KNOWN_SESSION_EVENT_TYPES` 白名单）。

## 安装

依赖 [dsh-auto-approval](../dsh-auto-approval)（host 半）：

```sh
dsh plugin --profile web add link:/<你的clone路径>/dsh-auto-approval/packages/dsh-client-ui-auto-approval
```

## 开发

```sh
pnpm run build   # 产出 lib/client.js（浏览器 bundle）+ lib/index.js（node 半空 apply）
```

## License

BSD-3-Clause
