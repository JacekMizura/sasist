/** Show operational debug UI in local dev and non-prod staging builds. */
export function isOperationalDebugVisible(): boolean {
  if (import.meta.env.DEV) return true;
  const env = String(import.meta.env.VITE_APP_ENV ?? "").toLowerCase();
  return env === "demo" || env === "staging" || env === "stage" || env === "test";
}
