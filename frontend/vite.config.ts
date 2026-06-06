import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Dev-only: Vite proxy target (not exposed to the browser bundle). */
const DEFAULT_PROXY_TARGET = 'http://localhost:8010'

/**
 * Bake a safe `import.meta.env.VITE_API_URL` at build time.
 * Railway sometimes sets http:// — upgrade to https:// before the client bundle is emitted.
 */
function normalizeBuildApiUrl(raw: string | undefined, mode: string): string | undefined {
  const v = (raw ?? '').trim().replace(/\/+$/, '')
  if (!v) return undefined

  let base = v
  if (base.startsWith('http://') && (mode === 'production' || base.includes('railway.app') || base.includes('vercel.app'))) {
    base = `https://${base.slice('http://'.length)}`
    console.warn(`[vite] VITE_API_URL upgraded to HTTPS for ${mode} build:`, base)
  }

  if (!base.startsWith('/') && !base.startsWith('https://') && !base.startsWith('http://')) {
    base = `https://${base}`
  }

  if (base.startsWith('/')) return base

  try {
    const u = new URL(base)
    if (u.pathname === '' || u.pathname === '/') {
      u.pathname = '/api'
      base = u.toString().replace(/\/+$/, '')
    }
  } catch {
    /* keep */
  }

  return base
}

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const viteApiRaw = (process.env.VITE_API_URL ?? fileEnv.VITE_API_URL ?? '').trim()
  const normalizedApiUrl = normalizeBuildApiUrl(viteApiRaw || undefined, mode)

  const rawProxy = (process.env.VITE_API_PROXY_TARGET ?? fileEnv.VITE_API_PROXY_TARGET ?? '').trim()
  const proxyTarget = rawProxy.replace(/\/+$/, '') || DEFAULT_PROXY_TARGET

  if (command === 'serve') {
    console.log(`[VITE] Proxy target: ${proxyTarget}`)
    if (normalizedApiUrl) {
      console.log(`[VITE] VITE_API_URL (client): ${normalizedApiUrl}`)
    }
  }

  if (command === 'build' && normalizedApiUrl) {
    console.log(`[VITE] build VITE_API_URL=${normalizedApiUrl}`)
  }

  return {
    plugins: [react(), basicSsl()],
    define: normalizedApiUrl
      ? { 'import.meta.env.VITE_API_URL': JSON.stringify(normalizedApiUrl) }
      : {},
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
        '/wms/photo-upload': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.json', '.mjs'],
    },
    build: {
      // Temporary: readable stack traces for production TDZ / circular-import crashes.
      sourcemap: true,
    },
  }
})
