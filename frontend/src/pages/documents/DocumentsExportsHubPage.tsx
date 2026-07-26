import { Link } from "react-router-dom";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { FolderOutput } from "lucide-react";

import { DocumentsSectionShell } from "./DocumentsSectionShell";
import DocumentsEmptyState from "./DocumentsEmptyState";
import {
  DocumentsFiltersToolbar,
  DocumentsKpiRow,
  DocumentsTableCard,
  documentsFilterInputCls,
} from "./documentsDashboardPrimitives";

const btnPrimary = brandPrimaryButtonClass;
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
        <DocumentsFiltersToolbar>
          <input
            type="search"
            placeholder="Szukaj w historii eksportów…"
            className={`${documentsFilterInputCls} w-full min-w-0 sm:max-w-md`}
            disabled
            aria-disabled="true"
          />
          <p className="text-sm text-slate-600">
            Pełny kreator i historia znajdują się w{" "}
            <Link to="/settings/exports" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Ustawienia → Eksporty
            </Link>
            .
          </p>
        </DocumentsFiltersToolbar>
      }
    >
      <DocumentsTableCard>
        <DocumentsEmptyState
          icon={FolderOutput}
          title="Eksporty w centrum ustawień"
          description="Tu przekierujemy Cię do nowego kreatora eksportów: encje, pola, filtry i historia paczek — ten sam styl co import CSV."
          action={
            <Link to="/settings/exports" className={btnPrimary}>
              Otwórz eksporty
            </Link>
          }
        />
      </DocumentsTableCard>
    </DocumentsSectionShell>
  );
}
