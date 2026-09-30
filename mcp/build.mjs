// Bundles the server (and the Angular app's pure-TS rules engine + SRD JSON) into one portable file.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  loader: { '.json': 'json' },
  // CJS dependencies (ajv, …) call require(); give the ESM bundle one.
  banner: {
    js: '#!/usr/bin/env node\nimport { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);',
  },
  logLevel: 'info',
});
