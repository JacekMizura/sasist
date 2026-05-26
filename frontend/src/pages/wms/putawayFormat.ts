/** Shared formatting for WMS putaway (no dependency on receiving screens). */

export function formatExpiryDatePl(iso: string | null | undefined): string | null {
  if (iso == null || String(iso).trim() === "") return null;
  const s = String(iso).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Auto-format while typing: ``dd.mm.yyyy`` (8 cyfr) lub ``mm.yyyy`` (6 cyfr). */
export function formatExpiryInputWhileTyping(raw: string): string {
  const d = (raw || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 6) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

/** dd.mm.rrrr lub mm.rrrr → YYYY-MM-DD (ISO) dla API. */
export function parseExpiryInputPlToIso(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const full = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (full) {
    const d = Number(full[1]);
    const m = Number(full[2]);
    const y = Number(full[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const mon = /^(\d{1,2})\.(\d{4})$/.exec(s);
  if (mon) {
    const m = Number(mon[1]);
    const y = Number(mon[2]);
    if (m < 1 || m > 12) return null;
    return `${y}-${String(m).padStart(2, "0")}-01`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return s.slice(0, 10);
  return null;
}

export function fmtQty(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(n);
}

/** Matches backend `pz_display_number` (PZ-RRRR-NNNN). */
export function pzDisplayLabel(createdAt: string | undefined, docId: number): string {
  const y = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  return `PZ-${y}-${String(docId).padStart(4, "0")}`;
}

/** Matches backend `mm_display_number` — operator label PM (document_type stays MM). */
export function pmDisplayLabel(createdAt: string | undefined, docId: number): string {
  const y = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  return `PM-${y}-${String(docId).padStart(4, "0")}`;
}
