import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['api/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'api/index.mjs',
  external: [
    // Don't bundle node built-ins
    'fs', 'path', 'os', 'crypto', 'stream', 'util', 'events', 'buffer',
    'http', 'https', 'net', 'tls', 'dns', 'url', 'querystring', 'zlib',
    'child_process', 'cluster', 'dgram', 'readline', 'repl', 'tty',
    'v8', 'vm', 'worker_threads', 'perf_hooks', 'async_hooks', 'assert',
    // Keep postgres external as it has native bindings
  ],
  banner: {
    js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
    `.trim(),
  },
});

console.log('API bundled successfully to api/index.mjs');
