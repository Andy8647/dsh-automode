/**
 * `auto-approval` locale namespace dictionaries for the status chip.
 *
 * The framework injects a `t` seat into the chip's props when its slot
 * registration declares `locale: 'auto-approval'` (see `./index.ts`), and the
 * browser follows the DSH locale preference — no plugin-side language switch.
 * `zh` is the key-set source of truth; `en` is checked complete against it.
 */
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    'chip.label': string;
    'chip.on': string;
    'chip.off': string;
    'chip.title': string;
    'chip.loading': string;
    'chip.error': string;
    'chip.counts': string;
    'dialog.title': string;
    'dialog.close': string;
    'dialog.loading': string;
    'dialog.unavailable': string;
    'status.enabled': string;
    'status.disabled': string;
    'toggle.on.desc': string;
    'toggle.off.desc': string;
    'toggle.on.aria': string;
    'toggle.off.aria': string;
    'config.safetyRules': string;
    'config.reviewModel': string;
    'config.trustedTools': string;
    'config.off': string;
    'stat.approved': string;
    'stat.denied': string;
    'history.title': string;
    'history.count': string;
    'history.empty': string;
    'table.time': string;
    'table.tool': string;
    'table.stage': string;
    'table.verdict': string;
    'table.detail': string;
    'verdict.allow': string;
    'verdict.deny': string;
};
/** The `auto-approval` namespace key union. */
export type AutoApprovalKey = keyof typeof zh;
/** English dictionary, checked complete against the zh key set. */
export declare const en: {
    'chip.label': string;
    'chip.on': string;
    'chip.off': string;
    'chip.title': string;
    'chip.loading': string;
    'chip.error': string;
    'chip.counts': string;
    'dialog.title': string;
    'dialog.close': string;
    'dialog.loading': string;
    'dialog.unavailable': string;
    'status.enabled': string;
    'status.disabled': string;
    'toggle.on.desc': string;
    'toggle.off.desc': string;
    'toggle.on.aria': string;
    'toggle.off.aria': string;
    'config.safetyRules': string;
    'config.reviewModel': string;
    'config.trustedTools': string;
    'config.off': string;
    'stat.approved': string;
    'stat.denied': string;
    'history.title': string;
    'history.count': string;
    'history.empty': string;
    'table.time': string;
    'table.tool': string;
    'table.stage': string;
    'table.verdict': string;
    'table.detail': string;
    'verdict.allow': string;
    'verdict.deny': string;
};
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The auto-approval chip's copy. */
        'auto-approval': AutoApprovalKey;
    }
}
//# sourceMappingURL=locales.d.ts.map