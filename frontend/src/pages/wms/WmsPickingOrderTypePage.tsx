import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { panelSidebarSubCountBadgeStyle } from "../../utils/panelSidebarHierarchy";
import type { WmsPickingOrderTypeChoice, WmsPickingOrderTypeNavState } from "./wmsPickingFlowTypes";
import { resolveAfterOrderTypeChoice, resolveAfterStatusWithConfig } from "./wmsPickingFlowResolve";
import { WmsPickingSessionTopBar } from "./WmsPickingSessionTopBar";
import { WMS_ROUTES } from "./wmsRoutes";

const CHOICES: { id: WmsPickingOrderTypeChoice; label: string }[] = [
  { id: "single", label: "Zamówienia jednoelementowe" },
  { id: "multi", label: "Zamówienia wieloelementowe" },
  { id: "all", label: "Wszystkie zamówienia" },
];

export default function WmsPickingOrderTypePage() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const session = (routerLocation.state as WmsPickingOrderTypeNavState | null)?.pickingSession;

  useEffect(() => {
    if (!session) {
      navigate(WMS_ROUTES.picking, { replace: true });
      return;
    }
    if (session.singleMode == null || session.multiMode == null) {
      navigate(WMS_ROUTES.picking, { replace: true });
      return;
    }
    const sm = session.singleMode;
    const mm = session.multiMode;
    if (sm === mm) {
      const { path, state } = resolveAfterStatusWithConfig(session);
      navigate(path, { replace: true, state });
    }
  }, [session, navigate]);

  const onPick = (choice: WmsPickingOrderTypeChoice) => {
    if (!session) return;
    const { path, state } = resolveAfterOrderTypeChoice(session, choice);
    navigate(path, { state });
  };

  if (!session) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 bg-white px-6 text-center text-sm font-medium text-slate-500">
        Przekierowanie…
      </div>
    );
  }

  const sm = session.singleMode;
  const mm = session.multiMode;
  if (sm == null || mm == null || sm === mm) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 bg-white px-6 text-center text-sm font-medium text-slate-500">
        Przekierowanie…
      </div>
    );
  }

  const badgeStyle = panelSidebarSubCountBadgeStyle(session.orderUiStatusColor, session.mainGroup);
  const hubOrderCount = session.hubOrderCount ?? null;
  const hubPickStats = session.hubPickStats ?? { zebrane: 0, doZebrania: 0, wTrakcie: 0 };

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
        <ul className="flex list-none flex-col gap-3 p-0">
          {CHOICES.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left text-sm font-bold text-slate-900 shadow-sm transition-[background-color,box-shadow,transform,border-color] hover:border-indigo-200 hover:bg-indigo-50/50 hover:shadow-md active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 sm:py-4 sm:text-base"
                onClick={() => onPick(c.id)}
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
        </div>
      </div>
    </div>
  );
}
