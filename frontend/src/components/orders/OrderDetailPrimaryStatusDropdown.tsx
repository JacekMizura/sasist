import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type {
  OrderUiMainGroup,
  OrderUiPanelSubgroupRead,
  OrderUiStatusBrief,
  OrderUiStatusPanelSummary,
  OrderUiStatusWithCount,
} from "../../types/orderUiStatus";
import { buildPanelSidebarLayout } from "../../utils/orderPanelSidebarBuckets";
import { ORDERS_PANEL_GROUP_LABELS } from "./OrdersPanelStatusSidebar";
import { panelSidebarSubRowStyleRich, sidebarSubStatusHex } from "../../utils/panelSidebarHierarchy";

type Props = {
  currentStatus: OrderUiStatusBrief | null;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[] | null;
  saving: boolean;
  /** Zapis statusu (PATCH + odświeżenie stanu). */
  onSelectStatus: (subStatusId: number | null) => Promise<void>;
  /** Kompaktowy pill jak nagłówek operacyjny OMS (rounded-xl, kropka, bez grubego paska). */
  variant?: "default" | "compact";
};

function statusLabelFull(status: OrderUiStatusBrief | null): string {
  if (!status?.name?.trim()) return "Bez etykiety — wybierz status";
  const g = status.main_group ?? "DONE";
  return `${ORDERS_PANEL_GROUP_LABELS[g]}: ${status.name.trim()}`;
}

function statusLabelCompact(status: OrderUiStatusBrief | null): string {
  if (!status?.name?.trim()) return "Status panelu";
  return status.name.trim();
}

const GROUP_MICRO: Record<OrderUiMainGroup, string> = {
  NEW: "Nowe",
  IN_PROGRESS: "W toku",
  DONE: "Zakończone",
};

function PickRow({
  s,
  mainGroup,
  selected,
  disabled,
  onPick,
}: {
  s: OrderUiStatusWithCount;
  mainGroup: OrderUiMainGroup;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      style={panelSidebarSubRowStyleRich(s, mainGroup, selected, { barWidthPx: 4 })}
      onClick={onPick}
    >
      {s.image_url ? (
        <img src={s.image_url} alt="" className="h-5 w-5 shrink-0 rounded object-contain" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{s.name}</span>
    </button>
  );
}

/**
 * Sellasist-style primary status control for order detail: one prominent chip + hierarchical picker (no native select).
 */
export function OrderDetailPrimaryStatusDropdown({
  currentStatus,
  panelSummary,
  panelSubgroups,
  saving,
  onSelectStatus,
  variant = "default",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const compact = variant === "compact";
  const group = currentStatus?.main_group ?? "DONE";
  const triggerStyle = panelSidebarSubRowStyleRich(currentStatus, group, open || saving, {
    barWidthPx: compact ? 0 : 5,
    primaryChip: compact ? false : true,
    inlineLabel: compact ? true : false,
  });
  const stripeHex = sidebarSubStatusHex(
    currentStatus?.badge_color ?? currentStatus?.color ?? null,
    group,
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apply = (subStatusId: number | null) => {
    setOpen(false);
    void onSelectStatus(subStatusId).catch(() => {
      /* błąd obsługuje rodzic */
    });
  };

  const sgDefs = panelSubgroups ?? [];
  const busy = saving;

  const sections =
    panelSummary?.groups
      .map((block) => {
        const layout = buildPanelSidebarLayout(block.main_group, block.sub_statuses, sgDefs);
        const hasRows =
          layout.ungrouped.length > 0 || layout.subgroupSections.some((x) => x.rows.length > 0);
        return hasRows ? { block, layout } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x != null) ?? [];

  const triggerBtnClass = compact
    ? "inline-flex h-[38px] max-w-[min(100%,14rem)] items-center gap-2 rounded-xl border border-slate-200/90 px-2.5 text-left text-xs font-semibold shadow-none outline-none ring-inset transition hover:brightness-[0.99] focus-visible:ring-2 focus-visible:ring-sky-500/30 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
    : "inline-flex min-h-[34px] w-fit max-w-[min(100%,36rem)] items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm font-semibold shadow-none outline-none transition hover:brightness-[0.99] focus-visible:ring-2 focus-visible:ring-sky-500/35 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div ref={rootRef} className={`relative max-w-full ${compact ? "" : "mt-3"}`}>
      <button
        type="button"
        disabled={busy || panelSummary == null}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={triggerBtnClass}
        style={compact ? { ...triggerStyle, borderLeft: "none", borderRadius: "0.75rem" } : triggerStyle}
        onClick={() => {
          if (panelSummary == null || busy) return;
          setOpen((v) => !v);
        }}
      >
        {compact ? (
          <>
            <span className="hidden shrink-0 text-[9px] font-semibold uppercase leading-none tracking-wide text-slate-400 sm:inline">
              {GROUP_MICRO[group]}
            </span>
            <span
              className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/80"
              style={{ backgroundColor: stripeHex }}
              aria-hidden
            />
          </>
        ) : currentStatus?.image_url ? (
          <img src={currentStatus.image_url} alt="" className="h-5 w-5 shrink-0 rounded object-contain" />
        ) : null}
        <span className="min-w-0 truncate">
          {compact ? statusLabelCompact(currentStatus) : statusLabelFull(currentStatus)}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && panelSummary != null ? (
        <div
          className="absolute left-0 top-full z-[120] mt-1.5 max-h-[min(70vh,26rem)] w-[min(100%,26rem)] overflow-y-auto rounded-lg border border-slate-200/95 bg-white py-2 shadow-xl ring-1 ring-slate-200/60"
          role="listbox"
          aria-label="Wybór statusu panelu"
        >
          <button
            type="button"
            className="mx-2 mb-1 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
            onClick={() => !busy && apply(null)}
          >
            Bez etykiety
          </button>

          {sections.map(({ block, layout }, idx) => {
            const { ungrouped, subgroupSections } = layout;
            return (
              <div
                key={block.main_group}
                className={`space-y-1 px-2 ${idx > 0 ? "mt-2 border-t border-slate-200/80 pt-2" : ""}`}
              >
                <div className="px-1.5 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {ORDERS_PANEL_GROUP_LABELS[block.main_group]}
                </div>
                <div className="space-y-1">
                  {ungrouped.map((s) => (
                    <PickRow
                      key={s.id}
                      s={s}
                      mainGroup={block.main_group}
                      selected={currentStatus?.id === s.id}
                      disabled={busy}
                      onPick={() => !busy && apply(s.id)}
                    />
                  ))}
                  {subgroupSections.map((sec) => (
                    <div key={sec.key} className="space-y-1">
                      <div className="px-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {sec.title}
                      </div>
                      {sec.rows.map((s) => (
                        <PickRow
                          key={s.id}
                          s={s}
                          mainGroup={block.main_group}
                          selected={currentStatus?.id === s.id}
                          disabled={busy}
                          onPick={() => !busy && apply(s.id)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
