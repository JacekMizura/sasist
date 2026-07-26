import type { WarehouseReportVariant } from "../reports/shared/types";
import { PrimaryButton } from "../../../design-system/PrimaryButton";
import { AppOverlayPortal } from "../../../components/overlay";

type ReportItem = {
  id: WarehouseReportVariant | "warehouse_value" | "top_volume";
  title: string;
};

const REPORT_ITEMS: ReportItem[] = [
  { id: "technical", title: "Raport struktury magazynu" },
  { id: "operations", title: "Raport zajętości magazynu" },
  { id: "executive", title: "Raport zarządczy" },
  { id: "product_locations", title: "Raport lokalizacji produktów" },
  { id: "warehouse_value", title: "Raport wartości magazynu" },
  { id: "top_volume", title: "Największe produkty (TOP 10)" },
];

export type WarehouseReportsPanelProps = {
  open: boolean;
  onClose: () => void;
  onDownload: (variant: WarehouseReportVariant) => void | Promise<void>;
  onDownloadWarehouseValue: () => void | Promise<void>;
  onDownloadTopVolume: () => void | Promise<void>;
};

export function WarehouseReportsPanel({
  open,
  onClose,
  onDownload,
  onDownloadWarehouseValue,
  onDownloadTopVolume,
}: WarehouseReportsPanelProps) {
  if (!open) return null;
  return (
    <AppOverlayPortal>
    <div
      className="fixed inset-0 z-[280] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="warehouse-reports-title"
      onClick={onClose}
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 id="warehouse-reports-title" className="text-base font-semibold text-slate-900">Raporty magazynu</h3>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700">
            Zamknij
          </button>
        </div>
        <div className="space-y-3 p-5">
          {REPORT_ITEMS.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              </div>
              <PrimaryButton
                type="button"
                onClick={async () => {
                  if (item.id === "warehouse_value") {
                    await onDownloadWarehouseValue();
                    onClose();
                    return;
                  }
                  if (item.id === "top_volume") {
                    await onDownloadTopVolume();
                    onClose();
                    return;
                  }
                  await onDownload(item.id);
                  onClose();
                }}
                className="shrink-0"
              >
                Pobierz
              </PrimaryButton>
            </div>
          ))}
        </div>
      </div>
    </div>
    </AppOverlayPortal>
  );
}
