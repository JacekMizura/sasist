import type { StockDocumentItemRead } from "../../api/stockDocumentsApi";
import { PurchaseSalesBlockLinePanel } from "./PurchaseSalesBlockLinePanel";
import { receiptLineDisplayName } from "../../pages/documents/warehouseDocumentLineUi";

type Props = {
  open: boolean;
  tenantId: number;
  documentId: number;
  line: StockDocumentItemRead | null;
  lineIndex: number;
  onClose: () => void;
  onUpdated: () => void;
};

export function PurchaseSalesBlockDrawer({
  open,
  tenantId,
  documentId,
  line,
  lineIndex,
  onClose,
  onUpdated,
}: Props) {
  if (!open || line == null) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/30"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-labelledby="sales-block-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Blokada sprzedaży</p>
            <h2 id="sales-block-drawer-title" className="mt-1 text-sm font-semibold text-slate-900">
              Pozycja #{lineIndex + 1}
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{receiptLineDisplayName(line)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Zamknij
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <PurchaseSalesBlockLinePanel
            key={line.id}
            tenantId={tenantId}
            documentId={documentId}
            line={line}
            onUpdated={() => {
              onUpdated();
              onClose();
            }}
            variant="drawer"
          />
        </div>
      </aside>
    </div>
  );
}
