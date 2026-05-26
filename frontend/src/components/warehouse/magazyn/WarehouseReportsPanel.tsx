import type { WarehouseReportVariant } from "../reports/shared/types";

type ReportItem = {
  id: WarehouseReportVariant | "warehouse_value" | "top_volume";
  title: string;
  description: string;
};

const REPORT_ITEMS: ReportItem[] = [
  {
    id: "technical",
    title: "Raport struktury magazynu",
    description: "Przegląd struktury lokalizacji, szablonów i układu pojemności.",
  },
  {
    id: "operations",
    title: "Raport zajętości magazynu",
    description: "Kluczowe wskaźniki wykorzystania przestrzeni i podział stref.",
  },
  {
    id: "executive",
    title: "Raport zarządczy",
    description: "Syntetyczne KPI biznesowe i priorytety decyzyjne dla kierownictwa.",
  },
  {
    id: "product_locations",
    title: "Raport lokalizacji produktów",
    description: "Rozkład produktów po lokalizacjach z ilością i typem strefy składowania.",
  },
  {
    id: "warehouse_value",
    title: "Raport wartości magazynu",
    description: "Łączna wartość produktów na podstawie cen zakupu i przypisanych lokalizacji.",
  },
  {
    id: "top_volume",
    title: "Największe produkty (TOP 10)",
    description: "Produkty zajmujące najwięcej przestrzeni magazynowej (objętość, waga, wartość).",
  },
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
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="warehouse-reports-title"
      onClick={onClose}
    >
      <div className="w-full rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
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
                <p className="mt-1 text-xs text-slate-600">{item.description}</p>
              </div>
              <button
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
                className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
              >
                Pobierz PDF
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
