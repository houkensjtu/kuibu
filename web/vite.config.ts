import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/kuibu/',
  plugins: [react(), tailwindcss()],
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
