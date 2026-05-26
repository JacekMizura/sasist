/** Canonical codes from backend ``compute_wms_workflow_phase`` (uppercase). */
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  AlertTriangle,
  ClipboardList,
  Package,
  PackageCheck,
  PackageOpen,
  ShoppingCart,
} from "lucide-react";

export type WmsWorkflowPhaseCode =
  | "TO_PICK"
  | "PICKING"
  | "NEEDS_DECISION"
  | "MISSING"
  | "READY_TO_PACK"
  | "PACKING"
  | "PACKED";

const KNOWN: ReadonlySet<string> = new Set([
  "TO_PICK",
  "PICKING",
  "NEEDS_DECISION",
  "MISSING",
  "READY_TO_PACK",
  "PACKING",
  "PACKED",
]);

export function normalizeWmsWorkflowPhase(raw: string | null | undefined): WmsWorkflowPhaseCode | null {
  if (!raw || typeof raw !== "string") return null;
  const u = raw.trim().toUpperCase();
  return KNOWN.has(u) ? (u as WmsWorkflowPhaseCode) : null;
}

export type WmsWorkflowPhasePresentation = {
  /** Krótka etykieta po polsku (lista zamówień / szczegóły). */
  label: string;
  /** Tooltip — zrozumiały opis operacyjny. */
  description: string;
  Icon: LucideIcon;
  pillClass: string;
};

export function wmsWorkflowPhasePresentation(phase: string | null | undefined): WmsWorkflowPhasePresentation | null {
  const code = normalizeWmsWorkflowPhase(phase);
  if (!code) return null;
  const map: Record<WmsWorkflowPhaseCode, WmsWorkflowPhasePresentation> = {
    TO_PICK: {
      label: "Oczekuje na zbieranie",
      description: "W kolejce zbierania (przed przypisaniem wózka — stary cache); normalnie faza nie jest zwracana bez danych WMS",
      Icon: ClipboardList,
      pillClass: "border-slate-200/90 bg-slate-50 text-slate-700",
    },
    PICKING: {
      label: "Zbieranie",
      description: "Zbieranie w toku",
      Icon: ShoppingCart,
      pillClass: "border-sky-200/90 bg-sky-50/90 text-sky-900",
    },
    NEEDS_DECISION: {
      label: "Braki — decyzja",
      description: "Braki wymagają decyzji w panelu",
      Icon: AlertCircle,
      pillClass: "border-amber-200/90 bg-amber-50/90 text-amber-950",
    },
    MISSING: {
      label: "Braki magazynowe",
      description: "Niedobór towaru na linii",
      Icon: AlertTriangle,
      pillClass: "border-orange-200/90 bg-orange-50/90 text-orange-950",
    },
    READY_TO_PACK: {
      label: "Do pakowania",
      description: "Zebrane — gotowe do stanowiska pakowania",
      Icon: PackageOpen,
      pillClass: "border-violet-200/90 bg-violet-50/90 text-violet-950",
    },
    PACKING: {
      label: "Pakowanie",
      description: "Trwa pakowanie zamówienia",
      Icon: Package,
      pillClass: "border-indigo-200/90 bg-indigo-50/90 text-indigo-950",
    },
    PACKED: {
      label: "Spakowane",
      description: "Pakowanie zakończone w magazynie",
      Icon: PackageCheck,
      pillClass: "border-emerald-200/90 bg-emerald-50/90 text-emerald-950",
    },
  };
  return map[code];
}

export function formatWmsPackedTooltip(
  packedAtIso: string | null | undefined,
  packedByLabel: string | null | undefined,
): string {
  const dateStr = (() => {
    if (!packedAtIso) return "—";
    try {
      const d = new Date(packedAtIso);
      if (Number.isNaN(d.getTime())) return "—";
      return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(d);
    } catch {
      return "—";
    }
  })();
  const op = (packedByLabel ?? "").trim();
  if (op) return `Spakowano przez ${op} • ${dateStr}`;
  return `Czas pakowania: ${dateStr}`;
}
