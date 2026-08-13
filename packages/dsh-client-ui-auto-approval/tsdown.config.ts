import { defineConfig } from 'tsdown'

/**
 * Replica of the upstream `clientBundle` preset (packages/client/tsdown.client.ts)
 * for a standalone repo. The client half emits a closure-factory artifact:
 * `window.__ModuleLoader__.load({ id, factory })` resolving externals through
 * the injected `require` (the loader's frozen module table). Everything not in
 * the platform module table is inlined (zod, local modules).
 *
 * The upstream CSS-module/lightningcss pipeline is omitted: this chip uses
 * inline styles, so there are no `.module.css` imports to compile.
 */

const ID = '@deepseek-ai/dsh-client-ui-auto-approval'

/** The module specifiers the shell shares into the frozen module table. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
] as const

/**
 * Documented temporary exemption: the snapshot-store engine lives in runtime
 * pending a rehome, so the runtime client entry rides the lazy CJS table.
 */
const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'

const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]

const NODE_ENV = process.env.NODE_ENV ?? 'production'

export default defineConfig([
  // node half — the host Loader imports this empty apply.
  {
    name: ID,
    entry: ['lib/types/index.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  // client half — served at /plugins/<id>/client.js by client-modules.
  {
    name: `${ID}/client`,
    entry: { client: 'lib/types/client/index.js' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    clean: false,
    external: [...CLIENT_EXTERNALS],
    define: {
      'process.env.NODE_ENV': JSON.stringify(NODE_ENV),
      'import.meta.env.MODE': JSON.stringify(NODE_ENV),
      'import.meta.env': JSON.stringify({ MODE: NODE_ENV }),
    },
    // tsdown auto-externalizes package dependencies; anything NOT in the
    // loader module table must inline instead (zod, local modules).
    noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
