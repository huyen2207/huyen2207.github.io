// Ranh giới "ngày học" là 04:00 GIỜ ĐỊA PHƯƠNG (CLAUDE.md §26), nên kết quả của
// PhaseEngine phụ thuộc múi giờ máy chạy. Ghim múi giờ để test cho cùng kết quả ở
// mọi nơi — nếu không, CI (UTC) và máy người học (UTC+7) sẽ bất đồng.
// Ghim CỨNG, không nhận đè từ môi trường: test phải cho cùng kết quả ở mọi máy.
process.env.TZ = 'Asia/Ho_Chi_Minh';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'N1 文法 90 Days',
        short_name: 'N1 文法',
        description: 'Hệ thống luyện 文法 JLPT N1 có thời hạn cứng',
        lang: 'vi',
        theme_color: '#1c1917',
        background_color: '#faf9f7',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('/src/content/data/')) return 'content';
          if (id.includes('node_modules/dexie')) return 'storage';
          if (id.includes('node_modules/zod')) return 'schema';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
} as never);
