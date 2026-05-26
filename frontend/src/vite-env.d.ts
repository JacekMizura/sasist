/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public origin for QR / deep links (e.g. http://192.168.1.10:5173 or https://xxx.ngrok.io). */
  readonly VITE_PUBLIC_URL?: string;
  /**
   * Backend API base URL including `/api`. Leave unset in dev to use Vite proxy (`/api` → FastAPI).
   */
  readonly VITE_API_URL?: string;
  /** Dev proxy target in vite.config.ts only (`loadEnv`); default http://localhost:8010 if unset. */
  readonly VITE_API_PROXY_TARGET?: string;
  /** WMS receiving: show dev EAN scanner panel when `"true"` (also shown in `import.meta.env.DEV` without this). */
  readonly VITE_ENABLE_DEV_SCANNER?: string;
}
