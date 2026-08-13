import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { AutoApprovalChipInjected } from './index.ts';
/** Full chip component props: the runtime standard kit + owner share + injected face. */
export type AutoApprovalChipProps = PropsRuntime<'conversation.input.left'> & InjectFace<AutoApprovalChipInjected>;
/**
 * The status pill. It owns its polling and is intentionally silent on failure:
 * a failed remote read renders a red "AA" with the error in the tooltip rather
 * than breaking the composer.
 */
export declare function AutoApprovalChip({ getStatus }: AutoApprovalChipProps): import("react").JSX.Element;
//# sourceMappingURL=AutoApprovalChip.d.ts.map