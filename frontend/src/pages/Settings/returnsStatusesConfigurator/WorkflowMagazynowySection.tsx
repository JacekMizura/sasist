import { RmzWorkflowProcessSection } from "./RmzWorkflowProcessSection";

type Props = {
  warehouseId: number | null;
};

export function WorkflowMagazynowySection({ warehouseId }: Props) {
  return (
    <details id="workflow-magazynowy" className="group">
      <summary className="cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Workflow magazynowy</h2>
            <p className="mt-1 text-sm text-slate-500">
              Etapy dokumentu zwrotu w magazynie. Większość sklepów nie musi tego zmieniać.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-400 group-open:hidden">Rozwiń</span>
        </div>
      </summary>

      <div className="mt-6 space-y-6 border-t border-slate-100 pt-6">
        <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
          To nie to samo co etykiety listy ani decyzje produktowe. Tutaj definiujesz etapy całego dokumentu zwrotu w
          magazynie — np. Przyjęty, Weryfikacja, Zakończony.
        </p>
        <RmzWorkflowProcessSection warehouseId={warehouseId} embedded />
      </div>
    </details>
  );
}
