import { useRef } from "react";
import { Copy, Pencil, Printer, Trash2 } from "lucide-react";
import {
  warehouseDocIconBtnClass,
  warehouseDocIconBtnDangerClass,
  warehouseDocPrimaryBtnClass,
  warehouseDocSecondaryBtnClass,
} from "./warehouseDocumentDetailUi";
import { WarehouseDocumentFloatingMenu } from "./WarehouseDocumentFloatingMenu";

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
  const printBtnRef = useRef<HTMLButtonElement>(null);
  const showPzActions = (isDraft || isWmsCompleteDraft) && isPzDetail;
  const acceptLabel = detailBusy
    ? "Przetwarzanie…"
    : isWmsCompleteDraft
      ? "Zaksięguj"
      : "Zatwierdź przyjęcie";

  return (
    <footer className="flex h-14 shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-3 shadow-[0_-1px_0_0_rgb(226_232_240)]">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
                  className={`${warehouseDocIconBtnClass} !h-9 !w-9`}
                >
                  <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
                <button
                  ref={printBtnRef}
                  type="button"
                  aria-label="Drukuj"
                  title="Drukuj / PDF"
                  aria-expanded={detailPrintMenuOpen}
                  disabled={detailBusy}
                  onClick={onTogglePrintMenu}
                  className={`${warehouseDocIconBtnClass} !h-9 !w-9`}
                >
                  <Printer className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
                <WarehouseDocumentFloatingMenu
                  open={detailPrintMenuOpen}
                  anchorRef={printBtnRef}
                  onClose={() => {
                    if (detailPrintMenuOpen) onTogglePrintMenu();
                  }}
                  placement="top-end"
                  className="w-44 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg ring-1 ring-slate-900/5"
                >
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
                </WarehouseDocumentFloatingMenu>
              <button
                type="button"
                aria-label="Usuń dokument"
                title="Usuń dokument"
                disabled={detailBusy}
                onClick={onDelete}
                className={`${warehouseDocIconBtnDangerClass} !h-9 !w-9`}
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

      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
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
