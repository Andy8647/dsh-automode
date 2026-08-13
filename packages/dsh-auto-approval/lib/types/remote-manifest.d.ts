import type { InvocationDescriptor } from '@deepseek-ai/dsh-typert-protocol';
/**
 * Host-face Typert contribution, registered into `ctx.typert` so the gateway
 * serves `autoApprovalStatus/getStatus` from the strict descriptor table.
 * `schemas`/`model` are empty: the registry only consumes them for reflection
 * tooling, and this plugin exposes no public schemas or model surface.
 */
export declare const remoteManifest: {
    package: string;
    face: string;
    schemas: never[];
    model: {
        services: never[];
        events: never[];
        objects: never[];
    };
    invocations: InvocationDescriptor[];
};
//# sourceMappingURL=remote-manifest.d.ts.map