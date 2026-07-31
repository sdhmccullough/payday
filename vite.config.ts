import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        id: '/',
        name: 'PayDay',
        short_name: 'PayDay',
        description: 'Weekly pay calculator with cash tracking and payment history.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#101014',
        background_color: '#101014',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: 'Timesheet', url: '/?tab=timesheet' },
          { name: 'Cash', url: '/?tab=cash' },
          { name: 'History', url: '/?tab=history' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        // Never intercept Firebase traffic (RTDB long-poll/websocket, auth).
        navigateFallbackDenylist: [/^\/__\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(.*\.)?(firebaseio\.com|googleapis\.com|firebaseapp\.com|gstatic\.com)\//,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  build: {
    sourcemap: true
  }
});
