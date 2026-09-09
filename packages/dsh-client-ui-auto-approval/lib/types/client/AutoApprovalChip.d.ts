import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { AutoApprovalChipInjected } from './index.ts';
/** Full chip component props: the runtime standard kit + owner share + injected face + the locale `t` seat. */
export type AutoApprovalChipProps = PropsRuntime<'conversation.input.left'> & InjectFace<AutoApprovalChipInjected> & PropsLocale<'auto-approval'>;
/**
 * The status pill. It owns its polling and is intentionally silent on failure:
 * a failed remote read renders an error-colored "AA" with the error in the
 * tooltip rather than breaking the composer. Clicking opens the dialog
 * (toggle + history).
 */
export declare function AutoApprovalChip({ getStatus, getHistory, setEnabled, t }: AutoApprovalChipProps): import("react").JSX.Element;
//# sourceMappingURL=AutoApprovalChip.d.ts.map