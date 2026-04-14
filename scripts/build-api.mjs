import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['api/_app.ts'],
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
  footer: {
    // Vercel expects module.exports to be the handler/app directly
    js: 'module.exports = module.exports.default || module.exports;',
  },
});

console.log('API bundled successfully to api/index.js');
