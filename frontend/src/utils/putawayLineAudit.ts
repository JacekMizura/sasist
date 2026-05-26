import type { StockDocumentItemRead } from "../api/stockDocumentsApi";



export type PutawayRelocationAudit = {

  operatorName: string;

  operatorInitials: string;

  quantity: number;

  locationCode: string;

  at: string | null;

};



const CACHE_KEY = "wms.putaway.lastLineEvents";

const CACHE_MAX = 200;

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;



function operatorInitials(name: string): string {

  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();

  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();

  return "?";

}



function normLoc(code: string): string {

  return code.trim().toLowerCase();

}



/** Quantity at `putaway_last_location_name` from allocation rows (matches location badge). */

export function putawayQuantityAtLastLocation(it: StockDocumentItemRead): number | null {

  const loc = (it.putaway_last_location_name || "").trim();

  if (!loc) return null;

  const key = normLoc(loc);

  let sum = 0;

  let found = false;

  for (const a of it.putaway_allocations ?? []) {

    const code = (a.location_code || a.location_name || "").trim();

    if (!code || normLoc(code) !== key) continue;

    sum += Math.max(0, Number(a.quantity) || 0);

    found = true;

  }

  return found ? sum : null;

}



function loadCache(): Array<{

  itemId: number;

  operatorName: string;

  locationCode: string;

  quantity: number;

  at: string;

}> {

  try {

    const raw = sessionStorage.getItem(CACHE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw) as Array<{

      itemId: number;

      operatorName: string;

      locationCode: string;

      quantity: number;

      at: string;

    }>;

    if (!Array.isArray(parsed)) return [];

    const cutoff = Date.now() - CACHE_TTL_MS;

    return parsed.filter((e) => {

      const t = new Date(e.at).getTime();

      return Number.isFinite(t) && t >= cutoff;

    });

  } catch {

    return [];

  }

}



function saveCache(

  events: Array<{

    itemId: number;

    operatorName: string;

    locationCode: string;

    quantity: number;

    at: string;

  }>,

) {

  try {

    sessionStorage.setItem(CACHE_KEY, JSON.stringify(events.slice(-CACHE_MAX)));

  } catch {

    /* quota / private mode */

  }

}



function readCachedPutawayEvent(itemId: number) {

  const events = loadCache().filter((e) => e.itemId === itemId);

  if (!events.length) return null;

  return events[events.length - 1]!;

}



/** Optional same-device cache until API reload returns persisted audit (not primary source). */

export function recordPutawayLineEvent(event: {

  itemId: number;

  operatorName: string;

  locationCode: string;

  quantity: number;

  at?: string;

}) {

  const operatorName = event.operatorName.trim();

  const locationCode = event.locationCode.trim();

  if (!operatorName || !locationCode || event.quantity <= 0) return;

  const next = {

    itemId: event.itemId,

    operatorName,

    locationCode,

    quantity: event.quantity,

    at: event.at ?? new Date().toISOString(),

  };

  const rest = loadCache().filter((e) => e.itemId !== event.itemId);

  saveCache([...rest, next]);

}



export function putawayOperatorNameFromAdminMap(

  adminId: number | null,

  adminNameById: Map<number, string>,

): string | null {

  if (adminId == null || adminId <= 0) return null;

  const mapped = adminNameById.get(adminId);

  if (mapped?.trim()) return mapped.trim();

  return null;

}



/** Resolve operator label from persisted line fields and optional admin directory. */

export function resolvePutawayOperatorName(

  it: StockDocumentItemRead,

  adminNameById?: Map<number, string>,

): string | null {

  const fromApi = (it.putaway_last_operator_name || "").trim();

  if (fromApi) return fromApi;



  const adminId = it.putaway_last_admin_id ?? null;

  if (adminId != null && adminId > 0 && adminNameById) {

    const fromMap = putawayOperatorNameFromAdminMap(adminId, adminNameById);

    if (fromMap) return fromMap;

  }

  if (adminId != null && adminId > 0) {

    return `Operator #${adminId}`;

  }



  const cached = readCachedPutawayEvent(it.id);

  if (cached?.operatorName) return cached.operatorName;



  return null;

}



function resolveLastQuantity(it: StockDocumentItemRead, locationCode: string): number | null {

  const locKey = normLoc(locationCode);

  const fromApi = it.putaway_last_quantity;

  if (fromApi != null && Number.isFinite(fromApi) && fromApi > 0) {

    const lastLoc = (it.putaway_last_location_name || "").trim();

    if (lastLoc && normLoc(lastLoc) === locKey) {

      return fromApi;

    }

  }



  const cached = readCachedPutawayEvent(it.id);

  if (cached && normLoc(cached.locationCode) === locKey && cached.quantity > 0) {

    const updatedAt = it.putaway_updated_at ? new Date(it.putaway_updated_at).getTime() : 0;

    const cachedAt = new Date(cached.at).getTime();

    if (!updatedAt || Math.abs(updatedAt - cachedAt) < 5 * 60 * 1000) {

      return cached.quantity;

    }

  }



  return putawayQuantityAtLastLocation(it);

}



/**

 * Last putaway on a line for card strip. Returns null when operator is unknown (hide row).

 */

export function putawayRelocationAudit(

  it: StockDocumentItemRead,

  adminNameById?: Map<number, string>,

): PutawayRelocationAudit | null {

  const put = Number(it.quantity_putaway) || 0;

  if (put <= 1e-9) return null;



  const operatorName = resolvePutawayOperatorName(it, adminNameById);

  if (!operatorName) return null;



  const locationCode = (it.putaway_last_location_name || "").trim();

  if (!locationCode) return null;



  const quantity = resolveLastQuantity(it, locationCode);

  if (quantity == null || quantity <= 0) return null;



  return {

    operatorName,

    operatorInitials: operatorInitials(operatorName),

    quantity,

    locationCode,

    at: it.putaway_updated_at ?? null,

  };

}



export function putawayOperatorAvatarInitials(audit: PutawayRelocationAudit | null): string {

  return audit?.operatorInitials ?? "?";

}


