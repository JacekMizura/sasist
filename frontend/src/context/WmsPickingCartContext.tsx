import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWarehouse } from "./WarehouseContext";
import type { WmsPickingSessionState } from "../pages/wms/wmsPickingFlowTypes";

const STORAGE_KEY = "wms_picking_cart_v2";

export type WmsPickingCartSnapshot = {
  tenantId: number;
  warehouseId: number;
  cartId: number;
  /** Kod z API (np. CART-0001) — źródło prawdy dla skanu i zapisów picks. */
  cartCode: string;
  /** Nazwa wózka (UI); opcjonalna. */
  cartName?: string;
};

function readStoredCart(): WmsPickingCartSnapshot | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return null;
    const o = p as Record<string, unknown>;
    const tenantId = Number(o.tenantId);
    const warehouseId = Number(o.warehouseId);
    const cartId = Number(o.cartId);
    const cartCode = String(o.cartCode ?? (o as { cartLabel?: string }).cartLabel ?? "").trim();
    const cartNameRaw = o.cartName;
    const cartName =
      cartNameRaw != null && String(cartNameRaw).trim() ? String(cartNameRaw).trim() : undefined;
    if (!Number.isFinite(tenantId) || !Number.isFinite(warehouseId) || !Number.isFinite(cartId) || !cartCode) {
      return null;
    }
    return { tenantId, warehouseId, cartId, cartCode, cartName };
  } catch {
    return null;
  }
}

function writeStoredCart(s: WmsPickingCartSnapshot | null) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (s == null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

type WmsPickingCartContextValue = {
  snapshot: WmsPickingCartSnapshot | null;
  setPickingCart: (s: WmsPickingCartSnapshot) => void;
  clearPickingCart: () => void;
};

const WmsPickingCartContext = createContext<WmsPickingCartContextValue | null>(null);

export function WmsPickingCartProvider({ children }: { children: ReactNode }) {
  const { warehouse } = useWarehouse();
  const whId = warehouse?.id ?? null;
  const [snapshot, setSnapshot] = useState<WmsPickingCartSnapshot | null>(() => readStoredCart());

  useEffect(() => {
    if (whId == null) return;
    setSnapshot((prev) => {
      if (prev != null && prev.warehouseId !== whId) {
        writeStoredCart(null);
        return null;
      }
      const stored = readStoredCart();
      if (stored != null && stored.warehouseId !== whId) {
        writeStoredCart(null);
        return null;
      }
      return stored ?? prev;
    });
  }, [whId]);

  const setPickingCart = useCallback((s: WmsPickingCartSnapshot) => {
    setSnapshot(s);
    writeStoredCart(s);
  }, []);

  const clearPickingCart = useCallback(() => {
    setSnapshot(null);
    writeStoredCart(null);
  }, []);

  const value = useMemo<WmsPickingCartContextValue>(
    () => ({ snapshot, setPickingCart, clearPickingCart }),
    [snapshot, setPickingCart, clearPickingCart],
  );

  return <WmsPickingCartContext.Provider value={value}>{children}</WmsPickingCartContext.Provider>;
}

export function useWmsPickingCart(): WmsPickingCartContextValue {
  const ctx = useContext(WmsPickingCartContext);
  if (!ctx) {
    throw new Error("useWmsPickingCart must be used within WmsPickingCartProvider");
  }
  return ctx;
}

/** Jedno źródło prawdy: snapshot kontekstu (tenant+magazyn), potem stan routera.
 * Cartless: nie nadpisuj cartId z leftover snapshotu fizycznego wózka.
 */
export function useMergedPickingSession(
  pickingSession: WmsPickingSessionState | null,
  tenantId: number,
  warehouseId: number | null,
): WmsPickingSessionState | null {
  const { snapshot } = useWmsPickingCart();
  return useMemo(() => {
    if (!pickingSession || warehouseId == null) return pickingSession;
    if (pickingSession.cartless || (pickingSession.pickingSessionId != null && pickingSession.pickingSessionId > 0)) {
      return {
        ...pickingSession,
        cartId: null,
        cartCode: null,
        cartName: null,
        cartless: true,
      };
    }
    const ctxMatch =
      snapshot != null &&
      snapshot.tenantId === tenantId &&
      snapshot.warehouseId === warehouseId;
    const cartId = ctxMatch ? snapshot.cartId : pickingSession.cartId ?? null;
    const cartCode = ctxMatch ? snapshot.cartCode : pickingSession.cartCode ?? null;
    const cartName = ctxMatch ? snapshot.cartName ?? null : pickingSession.cartName ?? null;
    return { ...pickingSession, cartId, cartCode, cartName };
  }, [pickingSession, tenantId, warehouseId, snapshot]);
}
