import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEFAULT_PROXY_TARGET = 'http://localhost:8010'

// HTTPS in dev so getUserMedia works on phones (secure context).
// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const raw = (env.VITE_API_PROXY_TARGET ?? '').trim()
  const proxyTarget = raw.replace(/\/+$/, '') || DEFAULT_PROXY_TARGET

  if (command === 'serve') {
    console.log(`[VITE] Proxy target: ${proxyTarget}`)
  }

  return {
    plugins: [react(), basicSsl()],
    server: {
      // Listen on 0.0.0.0 so phones/other PCs can open https://<LAN-IP>:5173 (or http if SSL is off).
      // Allow inbound TCP 5173 in Windows Firewall if the device cannot connect.
      host: true,
      port: 5173,
      // Same-origin /api, /uploads, /wms/photo-upload: browser → https://<host>:5173/... → FastAPI on proxy target.
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
      // Prefer .tsx over .ts so reserveLocationStyle resolves to .tsx
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.json', '.mjs'],
    },
  }
})
