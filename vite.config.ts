import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
      '@lib': '/lib',
    },
  },
  server: {
    port: parseInt(process.env.PORT || '5174'),
    strictPort: false,
    host: '127.0.0.1',
  },
})
