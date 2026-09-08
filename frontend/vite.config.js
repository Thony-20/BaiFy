// Forced restart to detect new tailwind config
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: ['LOGO2.png', 'icon-192x192.png', 'icon-512x512.png', 'screenshot-desktop.png', 'screenshot-mobile.png'],
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        id: '/',
        name: 'BAYFI - Sistema administrativo',
        short_name: 'BAYFI',
        description: 'Sistema administrativo de control de inventarios BAYFI.',
        theme_color: '#1A2035',
        background_color: '#1A2035',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        shortcuts: [
          {
            name: 'Dashboard',
            url: '/',
            icons: [{ src: 'icon-192x192.png', sizes: '192x192' }]
          },
          {
            name: 'Productos',
            url: '/productos',
            icons: [{ src: 'icon-192x192.png', sizes: '192x192' }]
          }
        ],
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        screenshots: [
          {
            src: 'screenshot-desktop.png',
            sizes: '1536x730',
            type: 'image/png',
            form_factor: 'wide',
            label: 'BAYFI Dashboard en Computadora'
          },
          {
            src: 'screenshot-mobile.png',
            sizes: '1536x730',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'BAYFI Dashboard en Celular'
          }
        ]
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
})
