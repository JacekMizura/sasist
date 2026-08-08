import type { WmsPackingModeParam } from "../../api/wmsPackingApi";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";

const STORAGE_KEY = "wms_packing_session_v3";
export const PENDING_WORKSTATION_KEY = "wms_packing_pending_workstation";

/** Shown when Agent print is requested without an active packing workstation. */
export const PACKING_STATION_REQUIRED_MSG = "Rozpocznij pakowanie i wybierz stanowisko.";

export type WmsPackingMode = WmsPackingModeParam;

/** Filtr jedno-/wieloelementowe — ta sama definicja co zbieranie (liczba aktywnych pozycji). */
export type WmsPackingOrderTypeFilter = "all" | "single" | "multi";

/** Stan sesji pakowania — SSOT aktywnego stanowiska (tylko w trakcie pakowania). */
export type WmsPackingSessionState = {
  statusId: number;
  statusName: string;
  statusColor: string;
  mainGroup: OrderUiMainGroup;
  mode?: WmsPackingMode;
  /** Domyślnie all — ustawiane kafelkami jedno-/wieloelementowe. */
  orderTypeFilter?: WmsPackingOrderTypeFilter;
  cartId?: number;
  cartCode?: string;
  cartType?: string;
  workstationId?: number;
  workstationName?: string;
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
    if (m === "no_cart" || m === "bulk" || m === "baskets" || m === "shelf") out.mode = m;
    const ot = rec.orderTypeFilter;
    if (ot === "all" || ot === "single" || ot === "multi") out.orderTypeFilter = ot;
    const cid = rec.cartId;
    if (cid != null && Number.isFinite(Number(cid))) out.cartId = Number(cid);
    if (typeof rec.cartCode === "string" && rec.cartCode.trim()) out.cartCode = rec.cartCode.trim();
    if (typeof rec.cartType === "string" && rec.cartType.trim()) out.cartType = rec.cartType.trim();
    const wid = rec.workstationId;
    if (wid != null && Number.isFinite(Number(wid)) && Number(wid) >= 1) {
      out.workstationId = Math.floor(Number(wid));
    }
    if (typeof rec.workstationName === "string" && rec.workstationName.trim()) {
      out.workstationName = rec.workstationName.trim();
    }
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
    sessionStorage.removeItem(PENDING_WORKSTATION_KEY);
  } catch {
    /* ignore */
  }
}

function pendingWorkstationId(): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_WORKSTATION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { workstationId?: number };
    const id = o.workstationId;
    if (id != null && Number.isFinite(Number(id)) && Number(id) >= 1) return Math.floor(Number(id));
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Active packing workstation — sole SSOT for Agent print routing.
 * Reads session first, then gate pending (before status creates full session).
 * Never reads auth/me or profile packing_station_id.
 */
export function packingSessionWorkstationId(): number | null {
  const s = loadWmsPackingSession();
  const id = s?.workstationId;
  if (id != null && Number.isFinite(Number(id)) && Number(id) >= 1) return Math.floor(Number(id));
  return pendingWorkstationId();
}

/** Czy zeskanowany typ wózka pasuje do wybranego trybu pakowania. */
export function cartTypeMatchesPackingMode(mode: WmsPackingMode, cartType: string | null | undefined): boolean {
  const t = (cartType || "").toLowerCase();
  if (mode === "bulk") return t === "bulk";
  if (mode === "baskets") return t === "multi";
  return true;
}
