import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

// public/models/characters/_original (siqilmagan asllar, ~7 MB) deployga tushmasin
function dropOriginalModels(): Plugin {
  return {
    name: 'drop-original-models',
    apply: 'build',
    async closeBundle() {
      await rm(fileURLToPath(new URL('./dist/models/characters/_original', import.meta.url)), { recursive: true, force: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), dropOriginalModels()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // "Jonli guvoh" vizual sinovi (src/proto)
        proto: fileURLToPath(new URL('./proto.html', import.meta.url)),
        // "Teleko'rsatuv kesimi" vizual sinovi (src/proto-b)
        protoB: fileURLToPath(new URL('./proto-b.html', import.meta.url)),
        // Meshy guvoh, real 3D zal (src/guvoh)
        guvoh: fileURLToPath(new URL('./guvoh.html', import.meta.url)),
        // CaseCraft kirish qismi: titul, rol tanlash, ish kartasi (src/intro)
        intro: fileURLToPath(new URL('./intro.html', import.meta.url)),
        // O'qituvchi paneli: sessiyalar, rubrika, tasdiq (src/teacher)
        teacher: fileURLToPath(new URL('./teacher.html', import.meta.url)),
      },
    },
  },
})
