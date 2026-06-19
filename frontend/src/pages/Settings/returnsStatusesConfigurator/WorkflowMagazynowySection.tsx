import { RmzWorkflowProcessSection } from "./RmzWorkflowProcessSection";
import { ConfiguratorSectionShell } from "./ConfiguratorSectionShell";

type Props = {
  warehouseId: number | null;
};

export function WorkflowMagazynowySection({ warehouseId }: Props) {
  return (
    <ConfiguratorSectionShell id="workflow-magazynowy" title="Workflow magazynowy">
      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-medium text-slate-600 marker:content-none hover:text-slate-900 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Pokaż etapy dokumentu w magazynie</span>
          <span className="hidden group-open:inline">Ukryj etapy dokumentu w magazynie</span>
        </summary>
        <div className="mt-6">
          <RmzWorkflowProcessSection warehouseId={warehouseId} embedded />
        </div>
      </details>
    </ConfiguratorSectionShell>
  );
}
