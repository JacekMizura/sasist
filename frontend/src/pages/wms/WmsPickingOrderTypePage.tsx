import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getWmsPickingOrderTypeHub,
  type WmsPickingOrderTypeHubSlice,
} from "../../api/wmsPickingEntryApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { WmsPickingOrderTypeChoice, WmsPickingOrderTypeNavState } from "./wmsPickingFlowTypes";
import { resolveAfterOrderTypeChoice, visibleOrderTypeChoices } from "./wmsPickingFlowResolve";
import { WMS_ROUTES } from "./wmsRoutes";
import { Loader2 } from "lucide-react";
import { wmsTypoClass } from "../../wms/typography/wmsOperatorTypography";
import { PickingSimpleHeader } from "../../components/wms/picking/PickingSimpleHeader";
import { PickingProcessAlert } from "../../components/wms/picking/PickingProcessAlert";

const CHOICE_META: Record<WmsPickingOrderTypeChoice, { label: string }> = {
  single: { label: "Zamówienia jednoelementowe" },
  multi: { label: "Zamówienia wieloelementowe" },
  all: { label: "Wszystkie zamówienia" },
};

const EMPTY_SLICE: WmsPickingOrderTypeHubSlice = {
  order_count: 0,
  products_picked: 0,
  products_total: 0,
};

function orderTypeProgressLabel(picked: number, total: number): string {
  if (picked > 1e-9) {
    return `Produkty: zebrano ${picked} / ${total} szt.`;
  }
  return `Produkty do zebrania: ${total} szt.`;
}

/**
 * Pierwszy krok NOWEJ tury zbierania — wybór single / multi / all.
 * Nie pomijamy tego ekranu z powodu wózka, wolnego wózka ani domyślnego order_type.
 * Wznowienie aktywnej sesji omija ten ekran wcześniej (status → products).
 */
export default function WmsPickingOrderTypePage() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const session = (routerLocation.state as WmsPickingOrderTypeNavState | null)?.pickingSession;
  const postTourMessage = (routerLocation.state as WmsPickingOrderTypeNavState | null)?.postTourMessage ?? null;
  const [tourBanner, setTourBanner] = useState<string | null>(postTourMessage);

  useEffect(() => {
    if (postTourMessage) setTourBanner(postTourMessage);
  }, [postTourMessage]);

  const [hubLoading, setHubLoading] = useState(false);
  const [hub, setHub] = useState<{
    single: WmsPickingOrderTypeHubSlice;
    multi: WmsPickingOrderTypeHubSlice;
    all: WmsPickingOrderTypeHubSlice;
  } | null>(null);

  const choices = useMemo(
    () => visibleOrderTypeChoices(session?.singleMode, session?.multiMode),
    [session?.singleMode, session?.multiMode],
  );

  useEffect(() => {
    if (!session) {
      navigate(WMS_ROUTES.picking, { replace: true });
      return;
    }
    if (session.singleMode == null && session.multiMode == null) {
      navigate(WMS_ROUTES.picking, { replace: true });
    }
  }, [session, navigate]);

  const loadHub = useCallback(async () => {
    if (!session || warehouseId == null) {
      setHub(null);
      return;
    }
    setHubLoading(true);
    try {
      const data = await getWmsPickingOrderTypeHub(
        DAMAGE_TENANT_ID,
        warehouseId,
        session.orderUiStatusId,
      );
      setHub({
        single: data.single,
        multi: data.multi,
        all: data.all,
      });
    } catch {
      setHub({
        single: EMPTY_SLICE,
        multi: EMPTY_SLICE,
        all: EMPTY_SLICE,
      });
    } finally {
      setHubLoading(false);
    }
  }, [session, warehouseId]);

  useEffect(() => {
    void loadHub();
  }, [loadHub]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadHub();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadHub]);

  const onPick = (choice: WmsPickingOrderTypeChoice) => {
    if (!session) return;
    const slice = hub?.[choice] ?? EMPTY_SLICE;
    const enriched = {
      ...session,
      hubOrderCount: slice.order_count,
      hubPickStats: {
        zebrane: slice.products_picked,
        doZebrania: Math.max(0, slice.products_total - slice.products_picked),
        wTrakcie: 0,
      },
    };
    const { path, state } = resolveAfterOrderTypeChoice(enriched, choice);
    navigate(path, { state });
  };

  if (!session || (session.singleMode == null && session.multiMode == null)) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 bg-white px-6 text-center text-sm font-medium text-slate-500">
        Przekierowanie…
      </div>
    );
  }

  const sliceFor = (id: WmsPickingOrderTypeChoice): WmsPickingOrderTypeHubSlice =>
    hub?.[id] ?? EMPTY_SLICE;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-white">
      <PickingSimpleHeader
        onBack={() => navigate(WMS_ROUTES.picking)}
        backAriaLabel="Wróć do wyboru statusu"
        title="Wybierz"
        trailing={
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-rose-500 active:scale-[0.99]"
            onClick={() => navigate(WMS_ROUTES.picking)}
          >
            Anuluj
          </button>
        }
      />
      <PickingProcessAlert
        open={tourBanner != null}
        tone="info"
        message={tourBanner}
        onClose={() => setTourBanner(null)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        {hubLoading && hub == null ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 size={36} className="mb-3 animate-spin text-slate-400" strokeWidth={2.5} />
            <p className="text-xs font-semibold uppercase tracking-wider">Ładowanie…</p>
          </div>
        ) : (
          <ul
            className="mx-auto grid w-full max-w-[1100px] list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Typ zamówień do zbierania"
          >
            {choices.map((id) => {
              const meta = CHOICE_META[id];
              const slice = sliceFor(id);
              const picked = Math.max(0, Number(slice.products_picked) || 0);
              const total = Math.max(0, Number(slice.products_total) || 0);
              return (
                <li key={id} className="min-w-0">
                  <button
                    type="button"
                    className={[
                      "flex h-full min-h-[7rem] w-full flex-col items-stretch justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition",
                      "hover:border-slate-300 hover:shadow-md active:scale-[0.99]",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
                    ].join(" ")}
                    onClick={() => onPick(id)}
                  >
                    <span
                      className={[
                        "font-bold leading-snug text-slate-900",
                        wmsTypoClass.base,
                      ].join(" ")}
                    >
                      {meta.label}
                    </span>
                    <p
                      className={[
                        "font-semibold tabular-nums leading-snug text-slate-700",
                        wmsTypoClass.quantity,
                      ].join(" ")}
                    >
                      {orderTypeProgressLabel(picked, total)}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
