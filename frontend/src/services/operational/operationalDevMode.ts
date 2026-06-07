/** Show operational debug UI only in local Vite dev — never in production builds. */
export function isOperationalDebugVisible(): boolean {
  return Boolean(import.meta.env.DEV);
}
