const storageKey = (warehouseId: number) => `wms-inv-active-doc-${warehouseId}`;

export function getActiveInventoryDocumentId(warehouseId: number): number | null {
  try {
    const raw = sessionStorage.getItem(storageKey(warehouseId));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setActiveInventoryDocumentId(warehouseId: number, documentId: number): void {
  try {
    sessionStorage.setItem(storageKey(warehouseId), String(documentId));
  } catch {
    /* private mode */
  }
}

export function clearActiveInventoryDocumentId(warehouseId: number): void {
  try {
    sessionStorage.removeItem(storageKey(warehouseId));
  } catch {
    /* ignore */
  }
}
