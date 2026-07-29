import { X } from "lucide-react";

import type { TemplateUsageReport } from "@/api/documentTemplatesApi";
import { AppOverlayPortal } from "../../../../components/overlay";
import { TemplateUsageReportBody } from "./TemplateUsageReportBody";

type Props = {
  templateName: string;
  report: TemplateUsageReport;
  onClose: () => void;
};

/** Right-side impact report: where this print template is configured. */
export function TemplateUsageDrawer({ templateName, report, onClose }: Props) {
  const total = report.summary?.total ?? report.total ?? 0;

  return (
    <AppOverlayPortal>
      <div className="fixed inset-0 z-[280]" role="presentation">
        <button
          type="button"
          className="absolute inset-0 bg-slate-900/40"
          aria-label="Zamknij raport użyć"
          onClick={onClose}
        />
        <aside
          className="absolute inset-y-0 right-0 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-usage-drawer-title"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="shrink-0 border-b border-slate-200 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Raport użycia</p>
                <h2 id="template-usage-drawer-title" className="mt-1 truncate text-lg font-semibold text-slate-900">
                  {templateName}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {total === 0
                    ? "Brak skonfigurowanych miejsc wykorzystania."
                    : `${total} ${total === 1 ? "miejsce" : total < 5 ? "miejsca" : "miejsc"} konfiguracji.`}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                onClick={onClose}
                aria-label="Zamknij"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
            <TemplateUsageReportBody report={report} onNavigate={onClose} />
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-3">
            <p className="text-xs text-slate-500">
              Przed usunięciem lub zmianą szablonu sprawdź, które firmy, magazyny, stanowiska i serie go używają.
            </p>
          </footer>
        </aside>
      </div>
    </AppOverlayPortal>
  );
}
