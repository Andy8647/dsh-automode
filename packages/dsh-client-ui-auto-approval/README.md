# dsh-client-ui-auto-approval

dsh-auto-approval 的 **client 伴侣包**：在聊天输入栏权限选择器（Read Only / Workspace Write / Full access）旁显示一个状态 chip，实时展示 host 侧 auto-approval 的运行态 —— armed 配置、本 turn 的 deny 计数、暂停状态。

```
[Access mode: Workspace Write]  ● AA on   [Select model...]
```

## 工作原理

数据走 Typert remote（`autoApprovalStatus/getStatus`），host 半的 `AutoApprovalStatusService` 读内存态（resolved 配置 + deny tracker），不落 session 事件。

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
