import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

export type LineActionKind = "sales_block" | "block_history" | "line_detail";

type Props = {
  lineId: number;
  hasProduct: boolean;
  hasActiveBlock: boolean;
  onAction: (kind: LineActionKind) => void;
};

export function WarehouseDocumentLineActionsMenu({
  lineId,
  hasProduct,
  hasActiveBlock,
  onAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={`Akcje pozycji ${lineId}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {hasActiveBlock ? (
        <span
          className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white"
          title="Aktywna blokada sprzedaży"
        />
      ) : null}
      {open ? (
        <div
          className="absolute right-0 top-full z-20 mt-1 min-w-[12rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          role="menu"
        >
          {hasProduct ? (
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
      ) : null}
    </div>
  );
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
