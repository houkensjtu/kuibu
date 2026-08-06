import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/kuibu/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt', not 'autoUpdate': a new deploy must never yank the app out
      // from under an in-progress reading/answering session (web brief
      // pitfall #5). App code decides *when* to apply a pending update --
      // see AppShell's useRegisterSW usage, which only does so once the
      // user is back on the idle Calendar tab.
      registerType: 'prompt',
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'kuibu',
        short_name: 'kuibu',
        description: 'A personal reading check-in tracker',
        display: 'standalone',
        theme_color: '#1c1917',
        background_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // NetworkFirst + a 3s timeout: reconciles "always fetch the
            // latest on launch" with "still usable offline / on a bad
            // connection" (web brief §PWA). Only navigation requests --
            // the hashed JS/CSS/pack JSON assets are content-addressed by
            // filename already, so precaching (the default for those) is
            // both correct and doesn't need this timeout/fallback dance.
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'kuibu-pages',
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // core/ lives one level up from web/ -- imported by relative path, per
    // CLAUDE.md's "core/ is zero-IO, shared verbatim between cli/ and web/".
    fs: {
      allow: ['..'],
    },
  },
})
