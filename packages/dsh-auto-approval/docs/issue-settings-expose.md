# [feature] 开放插件 settings namespace 的配置客户端暴露通道

## 背景

第三方插件通过 `ctx.settings.register()` / `installSettingsSection()` 注册配置命名空间，但**设置页 / 配置客户端看不到任何第三方插件的配置**。目前只有三类能出现在 Web 设置 UI 里：

1. 可配置模型 provider（`ctx.llm.listConfigurableProviders()` 声明的 `settingsNs`，如 `llm-deepseek`）
2. `permission`（硬编码）
3. `ui-onboarding`（硬编码）

## 现状代码证据

`packages/host/apiproxy/src/api-proxy.ts`：

```ts
const WEB_SETTINGS_NAMESPACES = ['permission'] as const
const PRODUCT_SETTINGS_NAMESPACES = new Set(['ui-onboarding'])
function exposedNamespaces(): Set<string> {
  const exposed = modelProviderNamespaces()      // ctx.llm.listConfigurableProviders() 的 settingsNs
  for (const ns of WEB_SETTINGS_NAMESPACES) exposed.add(ns)
  for (const ns of PRODUCT_SETTINGS_NAMESPACES) exposed.add(ns)
  return exposed
}
```

`settings.describe` RPC 只返回白名单内的 namespace（`.filter(descriptor => exposed.has(...))`），`settings.update/replace/mutate` 对白名单外直接 `settings-not-exposed` 拒绝。注释明确写了设计意图："a future registration does not become remotely readable or writable by default"。

client 侧设置页 section 是 slots 注册制（`settings.section` 独立页 / `settings.general.item` 嵌 General 页），第三方插件需要配套 dshClient 伴侣包注册，现有 `ui-permission`、`ui-models` 是现成模板。

## 问题

- **模型 provider 有专属通道、产品自带插件硬编码进白名单、第三方插件没有任何通道**——三者对插件生态不公平。
- 权限/automode 类插件（如 `dsh-auto-approval`，注册了 `auto-approval` namespace）**只能靠手改 `settings.yaml`**，无法 UI 配置，用户感知和可发现性都差。

## 期望

开放一条插件可声明的暴露通道，建议：

1. **Host 侧**：新增 `ctx.settings.expose(ns)`（注册时显式声明暴露给配置客户端），或允许组合配置扩展暴露名单（api-proxy 支持从 composition/config 读额外 namespace）。安全边界保留——暴露是**显式 opt-in**，不是默认。
2. **Client 侧**：确认 slots 伴侣包是官方预期路径（`ui-permission` 的 `settings.general.item` 模式），或考虑为「已暴露但无伴侣包的 namespace」提供 schema 自动渲染兜底（schema 已经是 `schema.toJSON()` 序列化的，理论上可自动渲染表单）。

## 参考

- #396「设置页新增插件管理面板」是相邻需求（管插件的启停/卸载），本 issue 管插件的**配置暴露**，可合并推进。
- 实际用例：`Andy8647/dsh-auto-approval`（`installSettingsSection` 注册 `auto-approval` namespace，Web UI 无 section，仅 settings.yaml 可配）。
