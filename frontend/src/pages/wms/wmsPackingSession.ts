import type { WmsPackingModeParam } from "../../api/wmsPackingApi";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";

const STORAGE_KEY = "wms_packing_session_v2";

export type WmsPackingMode = WmsPackingModeParam;

/** Stan sesji pakowania: status → tryb → opcjonalnie wózek (dla bulk/baskets). */
export type WmsPackingSessionState = {
  statusId: number;
  statusName: string;
  statusColor: string;
  mainGroup: OrderUiMainGroup;
  mode?: WmsPackingMode;
  cartId?: number;
  cartCode?: string;
  cartType?: string;
};

export function loadWmsPackingSession(): WmsPackingSessionState | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const rec = o as Record<string, unknown>;
    const statusId = Number(rec.statusId);
    if (!Number.isFinite(statusId) || statusId < 1) return null;
    const statusName = String(rec.statusName ?? "");
    const statusColor = String(rec.statusColor ?? "#94a3b8");
    const mg = String(rec.mainGroup ?? "NEW");
    const mainGroup = (["NEW", "IN_PROGRESS", "DONE"].includes(mg) ? mg : "NEW") as OrderUiMainGroup;
    const out: WmsPackingSessionState = {
      statusId,
      statusName,
      statusColor,
      mainGroup,
    };
    const m = rec.mode;
    if (m === "no_cart" || m === "bulk" || m === "baskets") out.mode = m;
    const cid = rec.cartId;
    if (cid != null && Number.isFinite(Number(cid))) out.cartId = Number(cid);
    if (typeof rec.cartCode === "string" && rec.cartCode.trim()) out.cartCode = rec.cartCode.trim();
    if (typeof rec.cartType === "string" && rec.cartType.trim()) out.cartType = rec.cartType.trim();
    return out;
  } catch {
    return null;
  }
}

export function saveWmsPackingSession(s: WmsPackingSessionState): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function patchWmsPackingSession(patch: Partial<WmsPackingSessionState>): void {
  const cur = loadWmsPackingSession();
  if (!cur) return;
  saveWmsPackingSession({ ...cur, ...patch });
}

export function clearWmsPackingSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Czy zeskanowany typ wózka pasuje do wybranego trybu pakowania. */
export function cartTypeMatchesPackingMode(mode: WmsPackingMode, cartType: string | null | undefined): boolean {
  const t = (cartType || "").toLowerCase();
  if (mode === "bulk") return t === "bulk";
  if (mode === "baskets") return t === "multi";
  return false;
}
