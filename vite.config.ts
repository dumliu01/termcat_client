import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import electron from 'vite-plugin-electron';
import pkg from './package.json';

export default defineConfig(async ({ mode }) => {
  // Only load visualizer in build mode (its dependency `open` requires Node 18+)
  const visualizerPlugin = mode === 'build'
    ? (await import('rollup-plugin-visualizer')).visualizer({
        filename: 'dist/bundle-report.html',
        gzipSize: true,
        brotliSize: true,
      })
    : null;

  return {
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    visualizerPlugin,
    electron([
      {
        entry: 'src/main/main.ts',
        vite: {
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              external: ['ssh2', 'events', 'node-pty']
            }
          },
        },
        onstart({ reload }) {
          reload();
        },
      },
      {
        entry: 'src/preload/preload.ts',
        vite: {
          build: {
            outDir: 'dist/preload',
          },
        },
        onstart({ reload }) {
          reload();
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3001,
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-xterm': ['xterm', 'xterm-addon-fit', 'xterm-addon-unicode11', 'xterm-addon-web-links'],
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
          'vendor-i18n': ['i18next', 'react-i18next'],
          'vendor-lucide': ['lucide-react'],
        },
      },
    },
  },
  };
});
