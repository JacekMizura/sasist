import { useNavigate } from "react-router-dom";
import {
  Building2,
  ChevronRight,
  Factory,
  FileStack,
  MoreHorizontal,
  Printer,
  Sparkles,
  Warehouse,
} from "lucide-react";

import type {
  TemplateUsageEntry,
  TemplateUsageReport,
  TemplateUsageSections,
  TemplateUsageSummaryCounts,
} from "@/api/documentTemplatesApi";

type SectionKey = keyof TemplateUsageSections;

const SECTION_META: {
  key: SectionKey;
  title: string;
  icon: typeof Building2;
  empty: string;
}[] = [
  { key: "companies", title: "Firmy", icon: Building2, empty: "Brak użycia na poziomie firmy." },
  { key: "warehouses", title: "Magazyny", icon: Warehouse, empty: "Brak użycia w magazynach." },
  { key: "workstations", title: "Stanowiska", icon: Printer, empty: "Brak powiązanych stanowisk." },
  { key: "series", title: "Serie dokumentów", icon: FileStack, empty: "Brak serii używających tego szablonu." },
  { key: "rules", title: "Reguły automatyczne", icon: Sparkles, empty: "Brak reguł automatycznego druku." },
  { key: "other", title: "Inne miejsca wykorzystania", icon: MoreHorizontal, empty: "Brak innych użyć." },
];

const SUMMARY_CARDS: { key: keyof TemplateUsageSummaryCounts; label: string }[] = [
  { key: "companies", label: "Firmy" },
  { key: "warehouses", label: "Magazyny" },
  { key: "workstations", label: "Stanowiska" },
  { key: "series", label: "Serie" },
  { key: "rules", label: "Reguły" },
];

type Props = {
  report: TemplateUsageReport;
  onNavigate?: () => void;
};

export function TemplateUsageReportBody({ report, onNavigate }: Props) {
  const navigate = useNavigate();
  const summary = report.summary ?? emptySummary();
  const sections = report.sections ?? emptySections();

  const openLink = (entry: TemplateUsageEntry) => {
    if (!entry.erp_link) return;
    onNavigate?.();
    navigate(entry.erp_link);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {SUMMARY_CARDS.map((card) => (
          <div
            key={card.key}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-center"
          >
            <div className="text-xl font-semibold tabular-nums text-slate-900">{summary[card.key]}</div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {card.label}
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm text-slate-600">
        Raport pokazuje konkretne miejsca konfiguracji korzystające z tego szablonu. Kliknij nazwę obiektu,
        aby przejść do jego ustawień.
      </p>

      <div className="space-y-5">
        {SECTION_META.map((section) => {
          const Icon = section.icon;
          const entries = sections[section.key] ?? [];
          return (
            <section key={section.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <header className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600 ring-1 ring-slate-200">
                  {entries.length}
                </span>
              </header>

              {entries.length === 0 ? (
                <p className="px-4 py-5 text-sm text-slate-500">{section.empty}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {entries.map((entry) => {
                    const clickable = Boolean(entry.erp_link);
                    const RowTag = clickable ? "button" : "div";
                    return (
                      <li key={entry.id}>
                        <RowTag
                          type={clickable ? "button" : undefined}
                          onClick={clickable ? () => openLink(entry) : undefined}
                          className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                            clickable ? "hover:bg-orange-50/60 focus-visible:bg-orange-50/60 focus-visible:outline-none" : ""
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-slate-900">{entry.title}</div>
                            {entry.subtitle ? (
                              <div className="mt-0.5 text-xs text-slate-500">{entry.subtitle}</div>
                            ) : null}
                          </div>
                          {clickable ? (
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                          ) : null}
                        </RowTag>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {summary.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <Factory className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
          <p className="mt-3 text-sm font-medium text-slate-800">Ten szablon nie jest jeszcze używany.</p>
          <p className="mt-1 text-xs text-slate-500">
            Po przypisaniu do firmy, magazynu lub serii dokumenty pojawią się w tym raporcie.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function emptySummary(): TemplateUsageSummaryCounts {
  return { companies: 0, warehouses: 0, workstations: 0, series: 0, rules: 0, other: 0, total: 0 };
}

function emptySections(): TemplateUsageSections {
  return { companies: [], warehouses: [], workstations: [], series: [], rules: [], other: [] };
}
