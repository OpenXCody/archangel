import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['api/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'api/index.js',
  external: [
    // Don't bundle node built-ins
    'fs', 'path', 'os', 'crypto', 'stream', 'util', 'events', 'buffer',
    'http', 'https', 'net', 'tls', 'dns', 'url', 'querystring', 'zlib',
    'child_process', 'cluster', 'dgram', 'readline', 'repl', 'tty',
    'v8', 'vm', 'worker_threads', 'perf_hooks', 'async_hooks', 'assert',
  ],
});

console.log('API bundled successfully to api/index.js');
