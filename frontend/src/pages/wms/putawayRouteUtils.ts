import type { StockDocumentItemRead, StockDocumentRead } from "../../api/stockDocumentsApi";
import type { WmsPutawayLocationSuggestions } from "../../api/wmsPutawayApi";

export function parsePutawayRouteIds(pzIdParam?: string, itemIdParam?: string): {
  pzId: number;
  itemId: number;
  valid: boolean;
} {
  const pzId = Number(pzIdParam);
  const itemId = Number(itemIdParam);
  const valid = Number.isFinite(pzId) && pzId >= 1 && Number.isFinite(itemId) && itemId >= 1;
  return { pzId, itemId, valid };
}

export function findPutawayDocumentLine(
  doc: StockDocumentRead,
  itemId: number,
): StockDocumentItemRead | undefined {
  const items = Array.isArray(doc.items) ? doc.items : [];
  return items.find((x) => Number(x.id) === itemId);
}

export function emptyPutawaySuggestions(): WmsPutawayLocationSuggestions {
  return {
    suggested_primary_locations: [],
    suggested_overflow_locations: [],
    existing_stock_locations: [],
  };
}

export function normalizePutawaySuggestions(
  raw: WmsPutawayLocationSuggestions | null | undefined,
): WmsPutawayLocationSuggestions {
  if (!raw || typeof raw !== "object") return emptyPutawaySuggestions();
  return {
    suggested_primary_locations: Array.isArray(raw.suggested_primary_locations)
      ? raw.suggested_primary_locations
      : [],
    suggested_overflow_locations: Array.isArray(raw.suggested_overflow_locations)
      ? raw.suggested_overflow_locations
      : [],
    existing_stock_locations: Array.isArray(raw.existing_stock_locations)
      ? raw.existing_stock_locations
      : [],
    distribution_plan: raw.distribution_plan ?? null,
  };
}
