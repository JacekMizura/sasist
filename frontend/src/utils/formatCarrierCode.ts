/** Opcje formatowania kodu nośnika (PAL-10 vs PAL-000010). */
export type FormatCarrierCodeOptions = {
  /** Liczba zer z przodu; 0 = bez paddingu (domyślnie). */
  zeroPad?: number;
};

const CARRIER_CODE_RE = /^([A-Za-z]+)-(\d+)$/;

/**
 * Formatuje kod nośnika do czytelnej postaci operacyjnej.
 * PAL-000010 → PAL-10 (domyślnie bez sztucznego paddingu).
 */
export function formatCarrierCode(
  raw: string | null | undefined,
  options?: FormatCarrierCodeOptions,
): string {
  const s = (raw || "").trim();
  if (!s) return "—";

  const m = CARRIER_CODE_RE.exec(s);
  if (!m) return s;

  const prefix = m[1].toUpperCase();
  const num = Number.parseInt(m[2], 10);
  if (!Number.isFinite(num)) return s;

  const pad = options?.zeroPad ?? 0;
  const numStr = pad > 0 ? String(num).padStart(pad, "0") : String(num);
  return `${prefix}-${numStr}`;
}

/** Zwraca surowy kod techniczny (bez normalizacji numeru). */
export function carrierCodeRaw(raw: string | null | undefined): string {
  return (raw || "").trim() || "—";
}
