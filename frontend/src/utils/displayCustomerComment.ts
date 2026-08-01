/**
 * Frontend-only guard: system / fulfillment logs must not appear as "Komentarz klienta".
 * Backend may still attach history snippets to latest_customer_comment_preview — we strip them here.
 */

const SYSTEM_LINE_RE =
  /\b(usuni[ęe]to|usun[ię]to|zmieniono|zg[łl]oszono|utworzono|nadano status|status zmien|zmiana magazynu|zmieniono magazyn|brak towaru|brak produktu|przeniesiono|zamieniono produkt|kompletacj|spakowano|przypisano|panel_fulfillment|TO_PICK|REPLACED|SHORTAGE)\b/i;

const HISTORY_PREVIEW_RE =
  /^\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\s*:|^\d{4}-\d{2}-\d{2}T|\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\s*.+/;

export function looksLikeSystemCustomerCommentLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (SYSTEM_LINE_RE.test(t)) return true;
  // Fulfillment history style: "12.03.2026 14:22: usunięto produkt · …"
  if (HISTORY_PREVIEW_RE.test(t) && SYSTEM_LINE_RE.test(t)) return true;
  if (/^·\s/.test(t) && SYSTEM_LINE_RE.test(t)) return true;
  return false;
}

/** True when the whole preview is (or mostly is) system history, not a real customer message. */
export function looksLikeFulfillmentHistoryPreview(raw: string): boolean {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  const systemHits = lines.filter(looksLikeSystemCustomerCommentLine).length;
  return systemHits >= Math.ceil(lines.length * 0.6);
}

/** Safe text for „Komentarz klienta” UI — empty when only system noise. */
export function displayCustomerComment(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (looksLikeFulfillmentHistoryPreview(t)) return "";
  return t
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !looksLikeSystemCustomerCommentLine(l))
    .join("\n")
    .trim();
}

export function hasDisplayableCustomerComment(raw: string | null | undefined): boolean {
  return Boolean(displayCustomerComment(raw));
}
