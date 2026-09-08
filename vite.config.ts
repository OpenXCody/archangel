import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// PWA: installable on iOS/Android home screens from the same build.
// The earlier attempt cached index.html and broke on deploys; this config
// never caches navigations, drops outdated precaches, and takes over
// immediately (skipWaiting + clientsClaim), so a new deploy wins on reload.

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png', 'data/*.geojson'],
      manifest: {
        name: 'Archangel',
        short_name: 'Archangel',
        description: 'US Manufacturing Workforce Intelligence Platform',
        theme_color: '#0f0f0f',
        background_color: '#0f0f0f',
        display: 'standalone',
        orientation: 'any',
        start_url: '/map',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Never serve a cached shell: HTML always comes from the network.
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,png,svg,woff2,geojson}'],
        // API responses are never cached by the service worker.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.hostname === 'api.maptiler.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'maptiler', expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 7 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
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
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
