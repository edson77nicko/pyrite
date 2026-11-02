import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import pkg from './package.json' with { type: 'json' }

function emitSandboxedPreloadCjs() {
  return {
    name: 'emit-sandboxed-preload-cjs',
    closeBundle() {
      const preloadMjs = path.resolve('dist-electron/preload.js')
      const preloadCjs = path.resolve('dist-electron/preload.cjs')
      if (fs.existsSync(preloadMjs)) {
        const raw = fs.readFileSync(preloadMjs, 'utf8')
        const cjs = raw
          .replace(
            /import\s*\{([^}]+)\}\s*from\s*["']electron["']\s*;?/,
            (_match, specifiers: string) => {
              const destructured = specifiers.replace(/\bas\b/g, ':')
              return `const {${destructured}} = require("electron");`
            }
          )
          .replace(/export\s*\{\s*\}\s*;?/g, '')
        fs.writeFileSync(preloadCjs, cjs, 'utf8')
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        entry: 'electron/main.ts',
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          plugins: [emitSandboxedPreloadCjs()]
        }
      },
    ]),
    renderer(),
  ],
  server: {
    watch: {
      ignored: ['**/release/**', '**/dist-electron/**', '**/release/**']
    }
  }
})
