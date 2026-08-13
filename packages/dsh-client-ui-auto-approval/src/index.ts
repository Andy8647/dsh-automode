/**
 * auto-approval status chip plugin, node half. Pure UI plugin: the empty
 * apply exists so the plugin appears in the host cordis.yml / Loader; the
 * browser half ships via exports["./client"], discovered through the
 * package.json `dsh.client` declaration. The status data itself comes from
 * the host `@deepseek-ai/dsh-auto-approval` Typert remote
 * (`autoApprovalStatus/getStatus`), mounted in the client half.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
