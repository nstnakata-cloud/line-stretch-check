import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
  build: { rollupOptions: { input: { app: resolve(import.meta.dirname,'index.html'), admin: resolve(import.meta.dirname,'admin.html'), privacy: resolve(import.meta.dirname,'privacy.html') } } },
})
