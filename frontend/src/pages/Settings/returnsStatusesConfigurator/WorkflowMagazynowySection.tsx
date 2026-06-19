import { Info } from "lucide-react";

import { RmzWorkflowProcessSection } from "./RmzWorkflowProcessSection";

type Props = {
  warehouseId: number | null;
};

export function WorkflowMagazynowySection({ warehouseId }: Props) {
  return (
    <details
      id="workflow-magazynowy"
      className="group rounded-xl border border-slate-200/90 bg-slate-50/40 shadow-sm open:bg-white"
    >
      <summary className="cursor-pointer list-none px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Opcjonalnie · integracje</p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Workflow magazynowy</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Etapy dokumentu zwrotu w magazynie (WMS). Większość sklepów nie musi tego zmieniać.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500 group-open:hidden">
            Rozwiń
          </span>
        </div>
      </summary>

      <div className="space-y-5 border-t border-slate-100 px-5 py-5">
        <div className="grid gap-3 lg:grid-cols-3">
          <ConceptCard
            title="Etykiety listy"
            where="Panel biurowy · lista zwrotów"
            what="Jak sortujesz i filtrujesz zwroty w pracy biurowej (Nowe / W toku / Zakończone)."
          />
          <ConceptCard
            title="Decyzje produktowe"
            where="Magazyn · pozycja zwrotu"
            what="Co operator robi z pojedynczą sztuką — przyjąć, odrzucić, wymienić."
          />
          <ConceptCard
            title="Etap workflow"
            where="Dokument RMZ · WMS"
            what="W jakim etapie jest cały dokument zwrotu w magazynie (np. Przyjęty → Weryfikacja → Zakończony)."
          />
        </div>

        <div className="flex gap-3 rounded-lg border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
          <p>
            <strong>Etykiety listy</strong> i <strong>etapy workflow</strong> to dwa niezależne systemy — pierwsze służą
            pracy biurowej, drugie śledzą postęp dokumentu w magazynie. <strong>Decyzje produktowe</strong> dotyczą
            pojedynczych pozycji, nie całego zwrotu.
          </p>
        </div>

        <RmzWorkflowProcessSection warehouseId={warehouseId} embedded />
      </div>
    </details>
  );
}

function ConceptCard({ title, where, what }: { title: string; where: string; what: string }) {
  return (
    <article className="rounded-lg border border-slate-200/80 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs font-medium text-slate-500">{where}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{what}</p>
    </article>
  );
}
