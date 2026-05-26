import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getWmsPickingResolveCart } from "../../api/wmsPickingProductsApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { playScanBeep } from "../../utils/playScanBeep";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { panelSidebarSubCountBadgeStyle } from "../../utils/panelSidebarHierarchy";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import {
  cartTypeMatchesPackingMode,
  loadWmsPackingSession,
  patchWmsPackingSession,
} from "./wmsPackingSession";
import { WMS_ROUTES } from "./wmsRoutes";

export default function WmsPackingScanCartPage() {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const {
    registerScanHandler,
    setActiveDocument,
    appendScanToHistory,
    refocusScannerInput,
    setScannerInputPlaceholder,
  } = useWmsScanner();

  const [session, setSession] = useState(() => loadWmsPackingSession());
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const s = loadWmsPackingSession();
    setSession(s);
    if (!s) {
      navigate(WMS_ROUTES.packing, { replace: true });
      return;
    }
    if (s.mode !== "bulk" && s.mode !== "baskets") {
      navigate(WMS_ROUTES.packingMode, { replace: true });
    }
  }, [navigate]);

  const mode = session?.mode;
  const isBulk = mode === "bulk";

  useEffect(() => {
    setActiveDocument({ kind: "custom", label: "Pakowanie — skan wózka" });
    return () => setActiveDocument(null);
  }, [setActiveDocument]);

  useEffect(() => {
    setScannerInputPlaceholder(isBulk ? "Zeskanuj wózek" : "Zeskanuj wózek z koszykami");
    refocusScannerInput();
  }, [setScannerInputPlaceholder, refocusScannerInput, isBulk]);

  const goOrdersWithCart = useCallback(
    async (cartCode: string) => {
      if (!session || warehouseId == null || (session.mode !== "bulk" && session.mode !== "baskets")) return;
      const code = cartCode.trim();
      if (!code) return;
      setResolveErr(null);
      setResolving(true);
      try {
        const r = await getWmsPickingResolveCart(DAMAGE_TENANT_ID, warehouseId, code);
        if (!cartTypeMatchesPackingMode(session.mode, r.cart_type)) {
          setResolveErr(
            session.mode === "baskets"
              ? "Ten wózek nie jest wózkiem z koszykami (MULTI) — zeskanuj właściwy wózek."
              : "Ten wózek nie jest wózkiem BULK — zeskanuj właściwy wózek.",
          );
          return;
        }
        playScanBeep();
        appendScanToHistory(code);
        const resolvedCode = (r.code && r.code.trim()) || r.barcode?.trim() || code;
        patchWmsPackingSession({
          cartId: r.cart_id,
          cartCode: resolvedCode,
          cartType: r.cart_type?.trim() || undefined,
        });
        navigate(WMS_ROUTES.packingOrders, { replace: true });
      } catch {
        setResolveErr("Nie rozpoznano wózka — sprawdź kod lub konfigurację w magazynie.");
      } finally {
        setResolving(false);
      }
    },
    [session, warehouseId, navigate, appendScanToHistory],
  );

  useEffect(() => {
    const handler = (ean: string) => {
      const scan = normalizeScanEan(ean);
      if (!scan || resolving) return;
      void goOrdersWithCart(scan);
    };
    registerScanHandler(handler);
    return () => registerScanHandler(null);
  }, [registerScanHandler, goOrdersWithCart, resolving]);

  if (!session || (session.mode !== "bulk" && session.mode !== "baskets")) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 bg-white px-6 text-center text-sm font-medium text-slate-500">
        Przekierowanie…
      </div>
    );
  }

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center bg-white px-6 py-12 text-center">
        <p className="max-w-md rounded-2xl border border-amber-200/90 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-950 shadow-sm">
          Wybierz magazyn w pasku u góry.
        </p>
      </div>
    );
  }

  const badgeStyle = panelSidebarSubCountBadgeStyle(session.statusColor, session.mainGroup);
  const title = isBulk ? "Zeskanuj wózek" : "Zeskanuj wózek z koszykami";
  const hint = isBulk
    ? "Wczytamy zamówienia z tego wózka BULK w wybranym statusie."
    : "Wczytamy zamówienia z wózka z koszykami (MULTI) w wybranym statusie.";

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        <button
          type="button"
          className="mb-6 self-start rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-bold text-slate-800 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-950"
          onClick={() => {
            patchWmsPackingSession({ cartId: undefined, cartCode: undefined, cartType: undefined });
            navigate(WMS_ROUTES.packingMode);
          }}
        >
          ← Sposób pakowania
        </button>

        <p
          className="mx-auto mb-4 inline-flex max-w-full items-center rounded-xl px-4 py-2 text-base font-bold text-neutral-950 shadow-sm"
          style={badgeStyle}
        >
          <span className="truncate">{session.statusName}</span>
        </p>

        <header className="mb-4 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">Użyj skanera lub pola skanera na dole ekranu.</p>
        </header>

        {resolveErr ? (
          <p className="mb-3 rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-900">
            {resolveErr}
          </p>
        ) : null}
        {resolving ? (
          <p className="mb-3 text-center text-xs font-medium text-slate-500">Weryfikacja wózka…</p>
        ) : null}

        <div
          className="mt-4 flex min-h-[200px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-300 bg-white px-4 py-12 text-center shadow-sm sm:min-h-[260px]"
          aria-hidden
        >
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-800">Skaner</p>
          <p className="mt-3 max-w-md text-base font-medium leading-relaxed text-slate-600">{hint}</p>
        </div>
      </div>
    </div>
  );
}
