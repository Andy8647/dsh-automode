/**
 * DSH 权限自动审批插件 — `dsh-auto-approval`
 *
 * 在 `tools/pre-execute` 瀑布最前挂一个两态 classifier，给 dsh 的 approval
 * policy 增加第三档 `auto`（现有：`ask` / `never`）：
 *
 *   L0 规则引擎（硬底线）→ L1 LLM classifier（意图对齐，可配）
 *
 * 全托管模式：决策收敛为 allow/deny 两态，不转人工。不确定的调用
 * （原 askPatterns 命中、L1 判定 ASK、fail-closed）一律 deny。
 *
 * 设计要点（详见 README「方案设计」）：
 * - L0 deny 同时走 `ctx.tools.guard()` 单调注册（M3），prepend 旁路不掉
 * - deny 的 reason 是通用文案，pattern 只进审计与日志（M2）
 * - 检测到 sandbox escalation 参数即豁免 L1，避免双重审批（M5）
 * - 本 turn deny 计数（tracker）从 session log 的 turn/start 惰性推导
 * - L1 一切失败 fail-closed 转 deny，绝不默认放行
 *
 * @module dsh-auto-approval
 */
import { Context } from '@deepseek-ai/cordis';
import { Config } from './config.ts';
export declare const name = "auto-approval";
/** settings 命名空间：settings.yaml 的 section 名，也是 Web UI 设置页的 section。 */
export declare const NS = "auto-approval";
export { Config } from './config.ts';
/**
 * 插件入口：挂载 `tools/pre-execute` 瀑布（prepend 最先跑）+ L0 deny 的
 * 单调 guard。配置非法直接 throw（fail-loud，M1）。
 *
 * 配置走 `ctx.settings.installSection`（settings 命名空间 `auto-approval`）：
 * composition entry 是 base 层，`$DSH_HOME/settings.yaml` 的
 * `auto-approval:` section 和 Web UI 设置页是 user 层，改动**热生效**——
 * `enabled` 就是 Web UI 里的 automode 开关。`validate` 钩子让带非法正则
 * / 不成对路由的写在提交前被拒（UI 层 fail-loud）。settings 服务缺席的
 * 组合（如 headless）自动回退 entry config。
 */
export declare function apply(ctx: Context, config?: Config): void;
export default apply;
//# sourceMappingURL=index.d.ts.map