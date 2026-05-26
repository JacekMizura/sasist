/**
 * Public app origin for QR and links opened on phones (LAN / ngrok).
 * Set `VITE_PUBLIC_URL` in `.env` (e.g. http://192.168.0.12:5173). No default in code.
 */
export function getPublicBaseUrl(): string {
  const raw = import.meta.env.VITE_PUBLIC_URL;
  const fromEnv = typeof raw === "string" ? raw.trim() : "";
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "";
}
