import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { WarehouseDocumentFloatingMenu } from "./WarehouseDocumentFloatingMenu";

export type LineActionKind =
  | "sales_block"
  | "block_history"
  | "line_detail"
  | "accept_delivery_diff";

type Props = {
  lineId: number;
  hasProduct: boolean;
  hasActiveBlock: boolean;
  canAddSalesBlock: boolean;
  canAcceptDeliveryDiff: boolean;
  onAction: (kind: LineActionKind) => void;
};

export function WarehouseDocumentLineActionsMenu({
  lineId,
  hasProduct,
  hasActiveBlock,
  canAddSalesBlock,
  canAcceptDeliveryDiff,
  onAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (triggerRef.current?.contains(el)) return;
      if (el.closest("[data-wh-doc-floating-menu]")) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Akcje pozycji ${lineId}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
        {hasActiveBlock ? (
          <span
            className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white"
            title="Aktywna blokada sprzedaży"
          />
        ) : null}
      </button>
      <WarehouseDocumentFloatingMenu
        open={open}
        anchorRef={triggerRef}
        onClose={() => setOpen(false)}
        placement="bottom-end"
      >
        <div data-wh-doc-floating-menu role="menu">
          {canAcceptDeliveryDiff ? (
            <MenuButton
              label="Zaakceptuj różnicę dostawy"
              onClick={() => {
                setOpen(false);
                onAction("accept_delivery_diff");
              }}
            />
          ) : null}
          {hasProduct && canAddSalesBlock ? (
            <MenuButton
              label="Dodaj blokadę sprzedaży"
              onClick={() => {
                setOpen(false);
                onAction("sales_block");
              }}
            />
          ) : null}
          <MenuButton
            label="Historia blokad"
            onClick={() => {
              setOpen(false);
              onAction("block_history");
            }}
          />
          <MenuButton
            label="Szczegóły pozycji"
            onClick={() => {
              setOpen(false);
              onAction("line_detail");
            }}
          />
        </div>
      </WarehouseDocumentFloatingMenu>
    </div>
  );
}

function MenuButton({
  label,
  onClick,
  disabled,
  title,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      className={`block w-full px-3 py-2 text-left text-sm ${
        disabled
          ? "cursor-not-allowed text-slate-400"
          : "text-slate-700 hover:bg-slate-50"
      }`}
      onClick={disabled ? undefined : onClick}
    >
      {label}
    </button>
  );
}
