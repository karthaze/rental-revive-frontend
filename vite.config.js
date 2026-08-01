import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'frontend',
  /* envDir defaults to `root`, which would point env loading at frontend/ —
     a directory that has never held a .env file. Anchor it here, where
     .env.local and .env.example actually live, or every VITE_* var resolves
     to undefined in the browser and the app degrades silently. */
  envDir: __dirname,
  server: { port: 8000, open: false },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'frontend/index.html'),
        privacy: resolve(__dirname, 'frontend/privacy.html'),
        terms: resolve(__dirname, 'frontend/terms.html'),
        onboard: resolve(__dirname, 'frontend/onboard.html'),
      },
    },
  },
})
