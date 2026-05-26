/** Etykieta środowiska (DEV / DEMO / PROD) do pasków nagłówka. */
export function getAppEnvChip(): { label: string; className: string } | null {
  const demo = String(import.meta.env.VITE_APP_ENV ?? "").toLowerCase() === "demo";
  if (demo) return { label: "DEMO", className: "border-violet-200 bg-violet-50 text-violet-800" };
  if (import.meta.env.DEV) return { label: "TEST", className: "border-amber-200 bg-amber-50 text-amber-900" };
  if (import.meta.env.PROD) return { label: "PROD", className: "border-emerald-200 bg-emerald-50 text-emerald-900" };
  return null;
}
