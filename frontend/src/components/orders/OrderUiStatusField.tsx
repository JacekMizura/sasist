import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { OrderUiStatusPicker } from "./OrderUiStatusPicker";
import { OrderUiStatusSelectedGroups } from "./OrderUiStatusSelectedGroups";
import {
  buildOrderUiStatusBriefById,
  buildOrderUiStatusNameById,
  fallbackOrderUiStatusBrief,
} from "./automation/buildOrderUiStatusNameById";

export type OrderUiStatusFieldProps = {
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups?: OrderUiPanelSubgroupRead[] | null;
  /** Optional override; defaults to name-only map from `panelSummary`. */
  statusNameById?: Map<number, string>;
  selectedStatusId?: number | null;
  onPick?: (statusId: number | null) => void;
  allowClear?: boolean;
  clearLabel?: string;
  selectedStatusIds?: readonly number[];
  onSelectedIdsChange?: (ids: number[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  listMaxHeightClass?: string;
  /**
   * Tailwind z-index for the floating list (default z-[130]).
   * Raise above modal shells (e.g. z-[5100] when parent is z-[5000]).
   */
  floatingZIndexClass?: string;
};

/**
 * Shared status field: selected statuses grouped by NOWE / W TOKU / ZAKOŃCZONE →
 * click opens popover with {@link OrderUiStatusPicker}.
 * Used by packing settings and order automations (single source of status selection UI).
 */
export function OrderUiStatusField({
  panelSummary,
  panelSubgroups,
  statusNameById: statusNameByIdProp,
  selectedStatusId = null,
  onPick,
  allowClear = false,
  clearLabel = "— brak —",
  selectedStatusIds,
  onSelectedIdsChange,
  placeholder = "Wybierz status…",
  disabled = false,
  className = "",
  listMaxHeightClass = "max-h-64",
  floatingZIndexClass = "z-[130]",
}: OrderUiStatusFieldProps) {
  const multi = typeof onSelectedIdsChange === "function";
  const [open, setOpen] = useState(false);
  const [focusStatusId, setFocusStatusId] = useState<number | null>(null);

  const statusBriefById = useMemo(() => buildOrderUiStatusBriefById(panelSummary), [panelSummary]);
  const statusNameById = useMemo(
    () => statusNameByIdProp ?? buildOrderUiStatusNameById(panelSummary),
    [statusNameByIdProp, panelSummary],
  );

  const selectedIds = useMemo(() => {
    if (multi) return [...(selectedStatusIds ?? [])];
    if (selectedStatusId != null && selectedStatusId > 0) return [selectedStatusId];
    return [] as number[];
  }, [multi, selectedStatusIds, selectedStatusId]);

  const chipStatuses = useMemo(
    () =>
      selectedIds.map(
        (id) => statusBriefById.get(id) ?? fallbackOrderUiStatusBrief(id, statusNameById.get(id)),
      ),
    [selectedIds, statusBriefById, statusNameById],
  );

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next) => {
      if (disabled) return;
      setOpen(next);
    },
    placement: "bottom-start",
    strategy: "fixed",
    middleware: [
      offset(6),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, elements, availableHeight }) {
          Object.assign(elements.floating.style, {
            width: `${Math.max(rects.reference.width, 288)}px`,
            maxHeight: `${Math.min(availableHeight, 420)}px`,
          });
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const dismiss = useDismiss(context, { ancestorScroll: true, outsidePress: true, escapeKey: true });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  useEffect(() => {
    if (!open) setFocusStatusId(null);
  }, [open]);

  const handlePick = (statusId: number | null) => {
    onPick?.(statusId);
    if (!multi) setOpen(false);
  };

  const handleSelectedIdsChange = (ids: number[]) => {
    onSelectedIdsChange?.(ids);
  };

  const toggleOpen = () => {
    if (!disabled) setOpen((v) => !v);
  };

  return (
    <div className={`relative min-w-0 w-full ${className}`}>
      <div
        ref={refs.setReference}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        className={`flex min-h-10 w-full cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-sm text-slate-900 outline-none transition hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
          disabled ? "cursor-not-allowed opacity-60" : ""
        } ${open ? "border-slate-300 ring-2 ring-blue-500/30" : ""}`}
        {...getReferenceProps({
          onClick: (e) => {
            if (disabled) return;
            const t = e.target as HTMLElement | null;
            if (t?.closest("button")) return;
            toggleOpen();
          },
          onKeyDown: (e) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleOpen();
            }
          },
        })}
      >
        <span className="min-w-0 flex-1 py-0.5">
          {chipStatuses.length > 0 ? (
            <OrderUiStatusSelectedGroups
              statuses={chipStatuses}
              removable={!disabled}
              onRemove={(statusId, index) => {
                if (multi) {
                  const next =
                    statusId != null
                      ? selectedIds.filter((id) => id !== statusId)
                      : selectedIds.filter((_, i) => i !== index);
                  onSelectedIdsChange?.(next);
                  return;
                }
                onPick?.(null);
              }}
              onBadgeClick={(statusId, index) => {
                if (disabled) return;
                setOpen(true);
                const id = statusId ?? selectedIds[index];
                if (id != null) setFocusStatusId(id);
              }}
            />
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`mt-2 h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
      </div>

      {open ? (
        <FloatingPortal id="floating-portal-order-ui-status-field">
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className={`${floatingZIndexClass} flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/10`}
            {...getFloatingProps()}
          >
            <OrderUiStatusPicker
              panelSummary={panelSummary}
              panelSubgroups={panelSubgroups}
              selectedStatusId={multi ? undefined : selectedStatusId}
              onPick={multi ? undefined : handlePick}
              allowClear={!multi && allowClear}
              clearLabel={clearLabel}
              selectedStatusIds={multi ? selectedIds : undefined}
              onSelectedIdsChange={multi ? handleSelectedIdsChange : undefined}
              focusStatusId={focusStatusId}
              onFocusStatusHandled={() => setFocusStatusId(null)}
              listMaxHeightClass={listMaxHeightClass}
              className="min-h-0 flex-1 rounded-none border-0 shadow-none"
            />
          </div>
        </FloatingPortal>
      ) : null}
    </div>
  );
}
