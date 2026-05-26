import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowDownUp,
  CircleCheck,
  Package,
  ShoppingCart,
} from "lucide-react";
import type { OrderUiMainGroup, OrderUiStatusWithCount } from "../../types/orderUiStatus";

export type PanelWmsOperationalMarker = {
  id: string;
  /** Tooltip / dostępność */
  title: string;
  Icon: LucideIcon;
  /** Styl obwódki ikony */
  wrapClass: string;
};

/**
 * Ikony operacyjne przy statusach panelu (nie przy nagłówkach grup).
 */
export function getPanelStatusWmsMarkers(
  s: OrderUiStatusWithCount,
  mainGroup: OrderUiMainGroup,
): PanelWmsOperationalMarker[] {
  const name = (s.name ?? "").trim();
  const n = name.toLowerCase();
  const markers: PanelWmsOperationalMarker[] = [];
  const push = (m: PanelWmsOperationalMarker) => {
    if (!markers.some((x) => x.id === m.id)) markers.push(m);
  };

  const shortageLike = /brak|niedobór|niedobor|shortage|deficyt|missing|niekomplet/i.test(n);
  const sortLike = /sortow|sorting/i.test(n);
  const completionLike =
    mainGroup === "DONE" &&
    /spakow|wysłan|wyslan|wysłk|dostarcz|komplet|gotow|zrealiz|odbier|closed|\bdone\b/i.test(n);

  if (shortageLike) {
    push({
      id: "short",
      title: "Braki / niedobory magazynowe",
      Icon: AlertTriangle,
      wrapClass: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80",
    });
  }
  if (sortLike) {
    push({
      id: "sort",
      title: "Sortowanie",
      Icon: ArrowDownUp,
      wrapClass: "bg-slate-50 text-slate-600 ring-1 ring-slate-200/80",
    });
  }
  if (completionLike) {
    push({
      id: "done",
      title: "Realizacja magazynowa zamknięta (np. spakowane)",
      Icon: CircleCheck,
      wrapClass: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80",
    });
  }

  const role = s.wms_workflow_role;
  if (!completionLike) {
    if (role === "picking_source" || role === "both") {
      push({
        id: "pick",
        title: "Kolejka zbierania (WMS)",
        Icon: ShoppingCart,
        wrapClass: "bg-sky-50 text-sky-700 ring-1 ring-sky-200/80",
      });
    }
    if (role === "picking_target" || role === "both") {
      push({
        id: "pack",
        title: "Pakowanie / kolejka magazynu (WMS)",
        Icon: Package,
        wrapClass: "bg-violet-50 text-violet-700 ring-1 ring-violet-200/80",
      });
    }
  }

  return markers;
}

/** @deprecated użyj getPanelStatusWmsMarkers */
export function getPanelStatusWmsChips(s: OrderUiStatusWithCount, mainGroup: OrderUiMainGroup) {
  return getPanelStatusWmsMarkers(s, mainGroup);
}

export function panelStatusCollapsedTitle(s: OrderUiStatusWithCount, mainGroup: OrderUiMainGroup): string {
  const base = (s.name ?? "").trim() || "Status";
  const markers = getPanelStatusWmsMarkers(s, mainGroup);
  if (!markers.length) return base;
  return `${base} — ${markers.map((m) => m.title).join("; ")}`;
}
