/**
 * host→browser 状态通道：把 auto-approval 的"运行态"（armed 配置摘要 +
 * 当前 agent 本 turn 的 deny 计数 / 暂停状态 / 累计决策统计 + 最近决策
 * 历史）通过 Typert remote 方法暴露给浏览器伴侣包，供权限选择器旁的
 * chip 读取（hover 统计 + 点击弹窗表格）。
 *
 * 选 remote 而非投影：chip 要的是运行态，投影必须从 session 事件 fold——
 * 写自定义事件会踩 08-12 final 的 `KNOWN_SESSION_EVENT_TYPES` 白名单
 * （第三方 `Session.append()` 无 ignorable 通道）。remote 直接读 host 内存态，
 * 不落 session 事件，且无 allowlist 限制。
 *
 * `@Remote` 方法里的 `Agent` 参数走 typert lookup：client 侧传 sessionId，
 * gateway 自动解析成 Agent 对象（与 `commands.list(agent)` 同机制）。
 * `setEnabled` 是 async：写入 settings 持久化（失败 fallback 运行时
 * override），gateway 的 strict dispatch 会 await 方法返回值。
 * @module @deepseek-ai/dsh-auto-approval/remote
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
/**
 * auto-approval 状态 remote 服务。注册为 Cordis 服务并绑定 Typert Gateway，
 * client 侧通过 `ctx.remote.autoApprovalStatus.getStatus(sessionId)` /
 * `getHistory(sessionId)` / `setEnabled(sessionId, enabled)` 调用。
 */
let AutoApprovalStatusService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _getStatus_decorators;
    let _getHistory_decorators;
    let _setEnabled_decorators;
    return class AutoApprovalStatusService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _getStatus_decorators = [Remote];
            _getHistory_decorators = [Remote];
            _setEnabled_decorators = [Remote];
            __esDecorate(this, null, _getStatus_decorators, { kind: "method", name: "getStatus", static: false, private: false, access: { has: obj => "getStatus" in obj, get: obj => obj.getStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getHistory_decorators, { kind: "method", name: "getHistory", static: false, private: false, access: { has: obj => "getHistory" in obj, get: obj => obj.getHistory }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _setEnabled_decorators, { kind: "method", name: "setEnabled", static: false, private: false, access: { has: obj => "setEnabled" in obj, get: obj => obj.setEnabled }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        hooks = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, hooks) {
            super(ctx, 'autoApprovalStatus');
            this.hooks = hooks;
        }
        /** 当前 agent 的 auto-approval 状态快照（无 agent 则 denials/统计归零）。 */
        getStatus(agent) {
            return this.hooks.read(agent);
        }
        /** 当前 agent 的最近决策历史（新→旧，最多 100 条；无 agent 返回空数组）。 */
        getHistory(agent) {
            return [...this.hooks.history(agent)];
        }
        /** 开关 auto-approval（写 settings 持久化；settings 缺席时运行时 override）。 */
        async setEnabled(agent, enabled) {
            await this.hooks.setEnabled(enabled);
            return this.hooks.read(agent);
        }
    };
})();
export { AutoApprovalStatusService };
//# sourceMappingURL=remote.js.map