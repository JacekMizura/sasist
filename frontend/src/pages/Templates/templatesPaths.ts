/**
 * Canonical Templates hub paths (IA).
 * Legacy aliases redirect here — do not use old bases for new links.
 */

export const TEMPLATES_HUB_BASE = "/templates";
export const TEMPLATES_LABELS_BASE = "/templates/labels";
export const TEMPLATES_PRINT_BASE = "/templates/print";
export const TEMPLATES_MESSAGES_BASE = "/templates/messages";
export const TEMPLATES_EXPORTS_BASE = "/templates/exports";

export function isTemplatesHubPath(pathname: string): boolean {
  return pathname === TEMPLATES_HUB_BASE || pathname.startsWith(`${TEMPLATES_HUB_BASE}/`);
}

/** Hide hub PageHeader/section tabs for immersive editors. */
export function isTemplatesHubChromeHidden(pathname: string): boolean {
  if (/^\/templates\/labels\/(designer|new)(\/|$)/.test(pathname)) return true;
  if (/^\/templates\/labels\/[^/]+\/edit$/.test(pathname)) return true;
  // Document template editor (numeric id), not new/starters
  if (/^\/templates\/print\/(?!new(?:\/|$)|starters(?:\/|$))\d+(?:\/|$)/.test(pathname)) return true;
  return false;
}
