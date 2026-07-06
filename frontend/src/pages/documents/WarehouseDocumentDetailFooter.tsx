import { Copy, Pencil, Printer, Trash2 } from "lucide-react";
import {
  warehouseDocIconBtnClass,
  warehouseDocIconBtnDangerClass,
  warehouseDocPrimaryBtnClass,
  warehouseDocSecondaryBtnClass,
} from "./warehouseDocumentDetailUi";

type Props = {
  detailBusy: boolean;
  detailId: number | null;
  detail: import("../../api/stockDocumentsApi").StockDocumentRead | null;
  detailPrintMenuOpen: boolean;
  onTogglePrintMenu: () => void;
  onClose: () => void;
  onScrollToLines: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onPrint: () => void;
  onDownloadPdf: () => void;
  canEditMetadata: boolean;
  onSaveMetadata: () => void;
  isDraft: boolean;
  isWmsCompleteDraft: boolean;
  isPzDetail: boolean;
  lineEditEnabled: boolean;
  canPostAccept: boolean;
  onReceiveAll: () => void;
  onSaveDraft: () => void;
  onAccept: () => void;
};

export function WarehouseDocumentDetailFooter({
  detailBusy,
  detailId,
  detail,
  detailPrintMenuOpen,
  onTogglePrintMenu,
  onClose,
  onScrollToLines,
  onDelete,
  onDuplicate,
  onPrint,
  onDownloadPdf,
  canEditMetadata,
  onSaveMetadata,
  isDraft,
  isWmsCompleteDraft,
  isPzDetail,
  lineEditEnabled,
  canPostAccept,
  onReceiveAll,
  onSaveDraft,
  onAccept,
}: Props) {
  const showPzActions = (isDraft || isWmsCompleteDraft) && isPzDetail;
  const acceptLabel = detailBusy
    ? "Przetwarzanie…"
    : isWmsCompleteDraft
      ? "Zaksięguj"
      : "Zatwierdź przyjęcie";

  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onClose} disabled={detailBusy} className={warehouseDocSecondaryBtnClass}>
          Zamknij
        </button>

        {detailId != null && detail ? (
          <>
            <div className="flex items-center gap-1" data-print-menu-root>
              <button
                type="button"
                aria-label="Edytuj pozycje"
                title="Edytuj pozycje"
                disabled={detailBusy}
                onClick={onScrollToLines}
                className={warehouseDocIconBtnClass}
              >
                <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              <div className="relative inline-flex">
                <button
                  type="button"
                  aria-label="Drukuj"
                  title="Drukuj / PDF"
                  disabled={detailBusy}
                  onClick={onTogglePrintMenu}
                  className={warehouseDocIconBtnClass}
                >
                  <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
                {detailPrintMenuOpen ? (
                  <div className="absolute bottom-full right-0 z-[320] mb-1 w-44 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg ring-1 ring-slate-900/5">
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                      onClick={onPrint}
                    >
                      Drukuj
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
                      onClick={onDownloadPdf}
                    >
                      Pobierz PDF
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Usuń dokument"
                title="Usuń dokument"
                disabled={detailBusy}
                onClick={onDelete}
                className={warehouseDocIconBtnDangerClass}
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>

            <button type="button" onClick={onDuplicate} disabled={detailBusy} className={warehouseDocSecondaryBtnClass}>
              <Copy className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              Duplikuj
            </button>
          </>
        ) : null}
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        {canEditMetadata ? (
          <button
            type="button"
            onClick={onSaveMetadata}
            disabled={detailBusy || !detail}
            className={warehouseDocSecondaryBtnClass}
          >
            {detailBusy ? "Zapisywanie…" : "Zapisz wartości"}
          </button>
        ) : null}

        {showPzActions ? (
          <>
            <button
              type="button"
              onClick={onReceiveAll}
              disabled={detailBusy || !detail || !lineEditEnabled}
              className={warehouseDocSecondaryBtnClass}
            >
              Przyjmij wszystko
            </button>
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={detailBusy || !detail || !lineEditEnabled}
              className={warehouseDocSecondaryBtnClass}
            >
              {detailBusy ? "Zapisywanie…" : "Zapisz ilości"}
            </button>
            <button
              type="button"
              onClick={onAccept}
              disabled={detailBusy || !detail || !canPostAccept}
              title={
                !canPostAccept && detail
                  ? "Najpierw ustaw magazyn (WMS → Przyjęcie). Lokalizacja przyjęcia zostanie uzupełniona automatycznie, jeśli jest dostępna w magazynie."
                  : undefined
              }
              className={warehouseDocPrimaryBtnClass}
            >
              {acceptLabel}
            </button>
          </>
        ) : null}
      </div>
    </footer>
  );
}
