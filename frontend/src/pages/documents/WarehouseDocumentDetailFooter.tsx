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

const btnGhost =
  "rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const btnSecondary =
  "rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const btnPrimary =
  "rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50";
const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-base leading-none hover:bg-slate-50 disabled:opacity-50";

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
    <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-6 py-4">
      <button type="button" onClick={onClose} disabled={detailBusy} className={btnGhost}>
        Zamknij
      </button>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:gap-3">
        {detailId != null && detail ? (
          <>
            <div className="flex items-center gap-1" data-print-menu-root>
              <button
                type="button"
                aria-label="Edytuj pozycje"
                title="Edytuj pozycje"
                disabled={detailBusy}
                onClick={onScrollToLines}
                className={iconBtn}
              >
                ✏️
              </button>
              <div className="relative inline-flex">
                <button
                  type="button"
                  aria-label="Drukuj"
                  title="Drukuj / PDF"
                  disabled={detailBusy}
                  onClick={onTogglePrintMenu}
                  className={iconBtn}
                >
                  🖨
                </button>
                {detailPrintMenuOpen ? (
                  <div className="absolute bottom-full right-0 z-[320] mb-1 w-44 rounded-lg border border-slate-200 bg-white py-1 text-left shadow-lg">
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                      onClick={onPrint}
                    >
                      Drukuj
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
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
                className={`${iconBtn} border-rose-200 text-rose-800 hover:bg-rose-50`}
              >
                🗑
              </button>
            </div>

            <button type="button" onClick={onDuplicate} disabled={detailBusy} className={btnSecondary}>
              Duplikuj
            </button>
          </>
        ) : null}

        {canEditMetadata ? (
          <button type="button" onClick={onSaveMetadata} disabled={detailBusy || !detail} className={btnSecondary}>
            {detailBusy ? "Zapisywanie…" : "Zapisz wartości"}
          </button>
        ) : null}

        {showPzActions ? (
          <>
            <button
              type="button"
              onClick={onReceiveAll}
              disabled={detailBusy || !detail || !lineEditEnabled}
              className={btnSecondary}
            >
              Przyjmij wszystko
            </button>
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={detailBusy || !detail || !lineEditEnabled}
              className={btnSecondary}
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
              className={btnPrimary}
            >
              {acceptLabel}
            </button>
          </>
        ) : null}
      </div>
    </footer>
  );
}
