import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// No service worker. The app can still be added to a home screen (the manifest
// is a static file in client/public); everything it loads comes from the
// network, cached by the browser under the headers in vercel.json.

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@server': path.resolve(__dirname, './server'),
    },
  },
  root: './client',
  envDir: '..',  // Load .env from project root
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false, // Disable in production for smaller bundles
    chunkSizeWarningLimit: 1000, // MapLibre is large
    minify: 'terser',
    terserOptions: {
      compress: {
        // Strip chatty logs but keep error/warn so ErrorBoundary output survives in prod
        pure_funcs: ['console.log', 'console.debug', 'console.info'],
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          map: ['maplibre-gl'],
          query: ['@tanstack/react-query', 'zustand'],
          ui: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-popover'],
        },
      },
    },
  },
  server: {
    // WEB_PORT / PORT let a second copy of the app run beside the first.
    port: Number(process.env.WEB_PORT) || 5173,
    host: true, // reachable from phones/tablets on the same network for device testing
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT || 3000}`,
        changeOrigin: true,
      },
    },
  },
});
