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

import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import { AutomationStatusPicker } from "./AutomationStatusPicker";
import { AutomationValueBadges } from "./AutomationValueBadges";
import { buildOrderUiStatusNameById } from "./buildOrderUiStatusNameById";

export type AutomationStatusFieldProps = {
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups?: OrderUiPanelSubgroupRead[] | null;
  /** Optional override; defaults to name-only map from `panelSummary` (same as automations). */
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
};

/**
 * Shared status control for automations and WMS settings:
 * closed field with chips → click opens popover with {@link AutomationStatusPicker}.
 */
export function AutomationStatusField({
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
}: AutomationStatusFieldProps) {
  const multi = typeof onSelectedIdsChange === "function";
  const [open, setOpen] = useState(false);
  const [focusStatusId, setFocusStatusId] = useState<number | null>(null);

  const statusNameById = useMemo(
    () => statusNameByIdProp ?? buildOrderUiStatusNameById(panelSummary),
    [statusNameByIdProp, panelSummary],
  );

  const selectedIds = selectedStatusIds ?? [];
  const chipLabels = useMemo(() => {
    if (multi) {
      return selectedIds.map((id) => statusNameById.get(id) ?? `#${id}`);
    }
    if (selectedStatusId != null && selectedStatusId > 0) {
      return [statusNameById.get(selectedStatusId) ?? `#${selectedStatusId}`];
    }
    return [];
  }, [multi, selectedIds, selectedStatusId, statusNameById]);

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
        className={`flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-sm text-slate-900 outline-none transition hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
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
        <span className="min-w-0 flex-1">
          {chipLabels.length > 0 ? (
            <AutomationValueBadges
              labels={chipLabels}
              removable={!disabled}
              onRemove={(index) => {
                if (multi) {
                  const next = selectedIds.filter((_, i) => i !== index);
                  onSelectedIdsChange?.(next);
                  return;
                }
                onPick?.(null);
              }}
              onBadgeClick={(index) => {
                if (disabled) return;
                setOpen(true);
                if (multi) {
                  const id = selectedIds[index];
                  if (id != null) setFocusStatusId(id);
                } else if (selectedStatusId != null) {
                  setFocusStatusId(selectedStatusId);
                }
              }}
            />
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
      </div>

      {open ? (
        <FloatingPortal id="floating-portal-automation-status-field">
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[130] flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/10"
            {...getFloatingProps()}
          >
            <AutomationStatusPicker
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
