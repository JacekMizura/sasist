import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getWmsPickingOrderTypeHub,
  type WmsPickingOrderTypeHubSlice,
} from "../../api/wmsPickingEntryApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { panelSidebarSubCountBadgeStyle } from "../../utils/panelSidebarHierarchy";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { WmsPickingOrderTypeChoice, WmsPickingOrderTypeNavState } from "./wmsPickingFlowTypes";
import { resolveAfterOrderTypeChoice, visibleOrderTypeChoices } from "./wmsPickingFlowResolve";
import { WmsPickingSessionTopBar } from "./WmsPickingSessionTopBar";
import { WMS_ROUTES } from "./wmsRoutes";
import { Loader2 } from "lucide-react";

const CHOICE_META: Record<
  WmsPickingOrderTypeChoice,
  { label: string; productsCaption: string }
> = {
  single: {
    label: "Zamówienia jednoelementowe",
    productsCaption: "Liczba produktów zebranych",
  },
  multi: {
    label: "Zamówienia wieloelementowe",
    productsCaption: "Liczba produktów zebranych",
  },
  all: {
    label: "Wszystkie zamówienia",
    productsCaption: "Liczba produktów zebranych",
  },
};

const EMPTY_SLICE: WmsPickingOrderTypeHubSlice = {
  order_count: 0,
  products_picked: 0,
  products_total: 0,
};

export default function WmsPickingOrderTypePage() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const session = (routerLocation.state as WmsPickingOrderTypeNavState | null)?.pickingSession;

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
      setHub({ single: data.single, multi: data.multi, all: data.all });
    } catch {
      setHub({ single: EMPTY_SLICE, multi: EMPTY_SLICE, all: EMPTY_SLICE });
    } finally {
      setHubLoading(false);
    }
  }, [session, warehouseId]);

  useEffect(() => {
    void loadHub();
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

  const badgeStyle = panelSidebarSubCountBadgeStyle(session.orderUiStatusColor, session.mainGroup);
  const hubOrderCount = session.hubOrderCount ?? null;
  const hubPickStats = session.hubPickStats ?? { zebrane: 0, doZebrania: 0, wTrakcie: 0 };

  const sliceFor = (id: WmsPickingOrderTypeChoice): WmsPickingOrderTypeHubSlice =>
    hub?.[id] ?? EMPTY_SLICE;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-white">
      <WmsPickingSessionTopBar
        onBack={() => navigate(WMS_ROUTES.picking)}
        backAriaLabel="Wróć do wyboru statusu"
        orderCount={hubOrderCount}
        pickStats={hubPickStats}
        statusName={session.orderUiStatusName}
        statusBadgeStyle={badgeStyle}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto w-full max-w-lg">
          <h1 className="mb-5 text-center text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
            Wybierz
          </h1>

          {hubLoading && hub == null ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 size={36} className="mb-3 animate-spin text-[#5a4fcf]" strokeWidth={2.5} />
              <p className="text-[11px] font-black uppercase tracking-widest">Ładowanie…</p>
            </div>
          ) : (
            <ul className="flex list-none flex-col gap-3 p-0" aria-label="Typ zamówień do zbierania">
              {choices.map((id) => {
                const meta = CHOICE_META[id];
                const slice = sliceFor(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="group flex w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-5 text-left shadow-sm transition-[background-color,box-shadow,transform,border-color] hover:border-indigo-200 hover:bg-indigo-50/40 hover:shadow-md active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40"
                      onClick={() => onPick(id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-base font-bold leading-snug text-slate-900 sm:text-lg">
                          {meta.label}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Zamówień
                          </span>
                          <span className="text-2xl font-bold tabular-nums text-slate-900 leading-none">
                            {slice.order_count}
                          </span>
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">
                        {meta.productsCaption}
                        <span className="ml-2 font-semibold tabular-nums text-slate-800">
                          {slice.products_picked}/{slice.products_total}
                        </span>
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
