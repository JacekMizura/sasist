import type { ReactNode } from "react";
import { Download, Flag, MessageSquare, Pin, Printer, StickyNote } from "lucide-react";
import type { OrderQuickToolbarActionKind } from "./orderQuickActionKinds";

const iconBtn =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

export type OrderListBulkToolbarProps = {
  count: number;
  disabled?: boolean;
  onOpenMultiModal: () => void;
  onQuickAction: (kind: OrderQuickToolbarActionKind) => void;
  onExportSelected?: () => void;
  /** Dodatkowe akcje po prawej obok przycisku multiakcji, np. usuwanie / odznaczanie. */
  trailing?: ReactNode;
  /**
   * `tableBand` — wewnątrz karty (amber, pełna szerokość).
   * `pageHeader` / `selectionRow` — kompaktowy pasek (np. obok „Zaznacz…”).
   */
  placement?: "tableBand" | "pageHeader" | "selectionRow";
};

export function OrderListBulkToolbar({
  count,
  disabled,
  onOpenMultiModal,
  onQuickAction,
  onExportSelected,
  trailing,
  placement = "tableBand",
}: OrderListBulkToolbarProps) {
  const compactHeader = placement === "pageHeader" || placement === "selectionRow";
  const iconCluster = (
    <>
      <button
        type="button"
        disabled={disabled}
        className={iconBtn}
        title="Zmień status"
        aria-label="Zmień status"
        onClick={() => onQuickAction("change_status")}
      >
        <Flag className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        className={iconBtn}
        title="Wystaw dokument"
        aria-label="Wystaw dokument"
        onClick={() => onQuickAction("issue_document")}
      >
        <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        className={iconBtn}
        title="Komentarz"
        aria-label="Komentarz"
        onClick={() => onQuickAction("send_message")}
      >
        <MessageSquare className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        className={iconBtn}
        title="Notatka"
        aria-label="Notatka"
        onClick={() => onQuickAction("add_note")}
      >
        <StickyNote className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled}
        className={iconBtn}
        title="Notatki operacyjne (WMS)"
        aria-label="Notatki operacyjne (WMS)"
        onClick={() => onQuickAction("operational_notes")}
      >
        <Pin className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        disabled={disabled || !onExportSelected}
        className={iconBtn}
        title="Eksport"
        aria-label="Eksport"
        onClick={() => onExportSelected?.()}
      >
        <Download className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
    </>
  );

  if (compactHeader) {
    return (
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <span className="mr-1 hidden text-[11px] font-medium tabular-nums text-slate-500 sm:inline">Zaznaczono: {count}</span>
        <div className="flex flex-wrap items-center gap-1">{iconCluster}</div>
        <button
          type="button"
          disabled={disabled}
          onClick={onOpenMultiModal}
          className="inline-flex h-8 shrink-0 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-40"
        >
          Multiakcje
        </button>
        {trailing ? <div className="flex flex-wrap items-center gap-1">{trailing}</div> : null}
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-amber-200/80 bg-amber-50/90 px-3 py-2.5">
      <span className="text-xs font-semibold text-amber-950">Zaznaczone: {count}</span>

      <div className="flex flex-wrap items-center justify-center gap-1 sm:flex-1">{iconCluster}</div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onOpenMultiModal}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
        >
          Multiakcje
        </button>
        {trailing}
      </div>
    </div>
  );
}
