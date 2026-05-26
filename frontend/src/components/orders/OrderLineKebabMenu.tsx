import { useMemo, type PointerEvent } from "react";
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { MoreVertical } from "lucide-react";

const MENU_PANEL =
  "z-[100] min-w-[180px] rounded-xl border border-slate-200 bg-white py-1 shadow-xl outline-none";

export type OrderLineKebabMenuProps = {
  lineId: number;
  /** Stały id kotwicy (np. testy, kompatybilność z wcześniejszym kodem). */
  anchorId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onRabat: () => void;
  onRemove: () => void;
  /** Domyślnie „Usuń produkt”. */
  removeLabel?: string;
  /** Klasa przycisku (compact vs magazyn). */
  buttonClassName?: string;
  /** Zablokuj akcje (archiwum / linia zamknięta) — pokaż komunikat zamiast cichego braku reakcji. */
  locked?: boolean;
  lockedMessage?: string;
};

export function OrderLineKebabMenu({
  lineId,
  anchorId,
  open,
  onOpenChange,
  onEdit,
  onRabat,
  onRemove,
  removeLabel = "Usuń produkt",
  buttonClassName = "flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
  locked = false,
  lockedMessage,
}: OrderLineKebabMenuProps) {
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement: "bottom-end",
    strategy: "fixed",
    middleware: [
      offset(8),
      flip({
        fallbackPlacements: ["top-end", "bottom-start", "top-start"],
        padding: 8,
      }),
      shift({ padding: 12 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const dismiss = useDismiss(context, {
    ancestorScroll: true,
    outsidePress: true,
    escapeKey: true,
  });

  const { getFloatingProps } = useInteractions([dismiss]);

  const wrapperId = useMemo(() => anchorId ?? `order-line-kebab-anchor-${lineId}`, [anchorId, lineId]);

  const itemCls =
    "flex w-full px-3 py-2 text-left text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent";
  const dangerCls =
    "flex w-full px-3 py-2 text-left text-xs font-medium text-red-700 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:text-red-300 disabled:hover:bg-transparent";

  const runMenuAction = (action: () => void) => {
    if (locked) return;
    action();
    onOpenChange(false);
  };

  const menuItemPointerProps = {
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault();
    },
  };

  return (
    <div id={wrapperId} className="relative flex shrink-0 items-center justify-center">
      <button
        type="button"
        ref={refs.setReference}
        className={buttonClassName}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menu pozycji"
        onClick={() => onOpenChange(!open)}
      >
        <MoreVertical className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <FloatingPortal id="floating-portal-order-line-kebab">
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className={MENU_PANEL}
            role="menu"
            {...getFloatingProps()}
          >
            {locked && lockedMessage ? (
              <p className="border-b border-slate-100 px-3 py-2 text-[11px] leading-snug text-slate-500">{lockedMessage}</p>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className={itemCls}
              disabled={locked}
              title={locked ? lockedMessage : undefined}
              {...menuItemPointerProps}
              onClick={() => runMenuAction(onEdit)}
            >
              Edytuj
            </button>
            <button
              type="button"
              role="menuitem"
              className={itemCls}
              disabled={locked}
              title={locked ? lockedMessage : undefined}
              {...menuItemPointerProps}
              onClick={() => runMenuAction(onRabat)}
            >
              Rabat
            </button>
            <button
              type="button"
              role="menuitem"
              className={dangerCls}
              disabled={locked}
              title={locked ? lockedMessage : undefined}
              {...menuItemPointerProps}
              onClick={() => runMenuAction(onRemove)}
            >
              {removeLabel}
            </button>
          </div>
        </FloatingPortal>
      ) : null}
    </div>
  );
}
