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
    activeOrderType: WmsPickingOrderTypeChoice | null;
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
      return;
    }
    // Aktywna sesja z wózkiem — pomiń „Wybierz”, wznów zbieranie.
    if (session.cartId != null && session.cartId > 0) {
      const { path, state } = resolveAfterOrderTypeChoice(
        session,
        session.orderTypeChoice ?? "all",
      );
      navigate(path, { replace: true, state });
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
      const active =
        data.active_order_type === "single" ||
        data.active_order_type === "multi" ||
        data.active_order_type === "all"
          ? data.active_order_type
          : null;
      setHub({
        single: data.single,
        multi: data.multi,
        all: data.all,
        activeOrderType: active,
      });
    } catch {
      setHub({
        single: EMPTY_SLICE,
        multi: EMPTY_SLICE,
        all: EMPTY_SLICE,
        activeOrderType: null,
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

  const activeOrderType = hub?.activeOrderType ?? null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-white">
      <PickingSimpleHeader
        onBack={() => navigate(WMS_ROUTES.picking)}
        backAriaLabel="Wróć do wyboru statusu"
        title="Wybierz"
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
            className="mx-auto flex w-full max-w-[1200px] list-none flex-wrap justify-center gap-4 p-0"
            aria-label="Typ zamówień do zbierania"
          >
            {choices.map((id) => {
              const meta = CHOICE_META[id];
              const slice = sliceFor(id);
              const isActive = activeOrderType === id;
              return (
                <li
                  key={id}
                  className="flex w-full min-w-0 max-w-[380px] basis-full sm:basis-[calc(50%-0.5rem)] lg:basis-[340px] lg:max-w-[360px]"
                >
                  <button
                    type="button"
                    aria-current={isActive ? "true" : undefined}
                    className={[
                      "flex h-full min-h-[8.5rem] w-full flex-col gap-2 rounded-xl border bg-white px-5 py-5 text-left shadow-sm transition",
                      "hover:border-slate-300 hover:shadow-md active:scale-[0.99]",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
                      isActive
                        ? "border-emerald-400/90 bg-emerald-50/40 ring-1 ring-emerald-200/80"
                        : "border-slate-200",
                    ].join(" ")}
                    onClick={() => onPick(id)}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <span
                        className={[
                          "min-w-0 font-bold leading-snug text-slate-900",
                          wmsTypoClass.base,
                        ].join(" ")}
                      >
                        {meta.label}
                      </span>
                      {isActive ? (
                        <span className="shrink-0 rounded-full border border-emerald-500/40 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                          Aktywne
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-auto text-sm leading-snug text-slate-600">
                      Produkty do zebrania:{" "}
                      <span className={["font-semibold text-slate-900", wmsTypoClass.quantity].join(" ")}>
                        {Math.max(0, Number(slice.products_picked) || 0)}/
                        {Math.max(0, Number(slice.products_total) || 0)} szt.
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
  );
}
