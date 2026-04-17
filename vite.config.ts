import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// PWA plugin disabled: during active deploys the service worker aggressively
// caches old HTML + chunks and breaks the app when chunk hashes rotate.
// Reintroduce vite-plugin-pwa once the app is stable if offline/installable
// support is wanted.

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
        drop_console: true, // Remove console.log in production
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
