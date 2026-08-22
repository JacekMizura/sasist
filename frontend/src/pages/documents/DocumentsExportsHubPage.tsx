import { Link } from "react-router-dom";
import { FolderOutput } from "lucide-react";

import { listSellasistInputClass } from "../../components/listPage/listSellasistTokens";
import { moduleTableCardClass } from "../../components/listPage/moduleList";
import { PrimaryButton } from "../../design-system";
import { DocumentsSectionShell } from "./DocumentsSectionShell";
import DocumentsEmptyState from "./DocumentsEmptyState";
import { DocumentsKpiRow } from "./documentsDashboardPrimitives";

export default function DocumentsExportsHubPage() {
  return (
    <DocumentsSectionShell
      title="Eksporty danych"
      kpi={
        <DocumentsKpiRow
          items={[
            { label: "Aktywne szablony", value: "—", tone: "slate" },
            { label: "Ostatnia paczka", value: "—", tone: "slate" },
            { label: "Zaplanowane", value: "—", tone: "amber" },
            { label: "Błędy (7 dni)", value: "0", tone: "emerald" },
          ]}
        />
      }
      toolbar={
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            type="search"
            placeholder="Szukaj w historii eksportów…"
            className={`${listSellasistInputClass} w-full min-w-0 sm:max-w-md`}
            disabled
            aria-disabled="true"
          />
          <p className="text-sm text-slate-600">
            Pełny kreator i historia znajdują się w{" "}
            <Link to="/templates/exports" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Szablony → Eksporty
            </Link>
            .
          </p>
        </div>
      }
    >
      <div className={moduleTableCardClass}>
        <DocumentsEmptyState
          icon={FolderOutput}
          title="Eksporty w centrum ustawień"
          description="Tu przekierujemy Cię do nowego kreatora eksportów: encje, pola, filtry i historia paczek — ten sam styl co import CSV."
          action={
            <Link to="/templates/exports">
              <PrimaryButton type="button" density="compact">
                Otwórz eksporty
              </PrimaryButton>
            </Link>
          }
        />
      </div>
    </DocumentsSectionShell>
  );
}
