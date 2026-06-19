import { useState, type Dispatch, type SetStateAction } from "react";
import { Info } from "lucide-react";

import type { ReturnModuleConfigDto } from "../../../types/returnModuleConfig";
import type { ReturnUiMainGroup, ReturnUiStatusWithCount } from "../../../types/wmsReturn";
import { DamageClassesEditor, DamageReasonsEditor } from "../returnsSettingsOps";
import { ProductDecisionsTableSection } from "./ProductDecisionsTableSection";
import { ReturnPanelSubgroupModal } from "./ReturnPanelSubgroupModal";
import { ReturnUiStatusModal } from "./ReturnUiStatusModal";
import { ReturnsListPreviewCard } from "./ReturnsListPreviewCard";
import { ReturnsPanelStatusGroupsCard } from "./ReturnsPanelStatusGroupsCard";
import { useReturnPanelStatusesConfig } from "./useReturnPanelStatusesConfig";

type Props = {
  warehouseId: number | null;
  cfg: ReturnModuleConfigDto;
  setDraft: Dispatch<SetStateAction<ReturnModuleConfigDto | null>>;
};

export function ReturnsStatusesConfigurator({ warehouseId, cfg, setDraft }: Props) {
  const panel = useReturnPanelStatusesConfig(warehouseId);
  const [subgroupModal, setSubgroupModal] = useState<ReturnUiMainGroup | null>(null);
  const [statusModal, setStatusModal] = useState<
    | { mode: "create"; mainGroup: ReturnUiMainGroup }
    | { mode: "edit"; status: ReturnUiStatusWithCount }
    | null
  >(null);
  const [statusBusy, setStatusBusy] = useState(false);

  if (warehouseId == null) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Wybierz magazyn w górnym pasku, aby konfigurować statusy zwrotów.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Statusy panelu — zwroty</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
          Wizualny konfigurator etykiet na liście zwrotów. Zmiany statusów panelu zapisują się od razu; decyzje produktowe — przyciskiem na dole strony.
        </p>
      </header>

      {panel.err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{panel.err}</div>
      ) : null}

      {panel.loading && !panel.summary ? (
        <p className="py-8 text-center text-sm text-slate-500">Wczytywanie statusów panelu…</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
          <ReturnsPanelStatusGroupsCard
            summary={panel.summary}
            panelSubgroups={panel.panelSubgroups}
            onAddSubgroup={(mg) => setSubgroupModal(mg)}
            onAddStatus={(mg) => setStatusModal({ mode: "create", mainGroup: mg })}
            onEditStatus={(s) => setStatusModal({ mode: "edit", status: s })}
            onDeleteStatus={(id) => void panel.removeStatus(id)}
          />
          <ReturnsListPreviewCard summary={panel.summary} cfg={cfg} />
        </div>
      )}

      <ProductDecisionsTableSection cfg={cfg} setDraft={setDraft} />

      <details className="rounded-xl border border-slate-200/90 bg-white shadow-sm">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Klasy i powody uszkodzeń (zaawansowane)
        </summary>
        <div className="space-y-4 border-t border-slate-100 p-4">
          <DamageClassesEditor cfg={cfg} setDraft={setDraft} />
          <DamageReasonsEditor cfg={cfg} setDraft={setDraft} />
        </div>
      </details>

      <div className="flex flex-wrap items-start gap-3 rounded-lg border border-sky-100 bg-sky-50/80 px-4 py-3 text-sm text-sky-950">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden />
        <p>
          Zmiany statusów panelu dotyczą wyłącznie widoku listy zwrotów i filtrów w panelu bocznym. Statusy workflow RMZ konfigurujesz w{" "}
          <a href="/orders/returns/workflow-statuses" className="font-medium underline decoration-sky-300 underline-offset-2">
            statusach workflow
          </a>
          .
        </p>
      </div>

      {subgroupModal != null ? (
        <ReturnPanelSubgroupModal
          open
          initialMainGroup={subgroupModal}
          warehouseId={warehouseId}
          onClose={() => setSubgroupModal(null)}
          onCreated={() => void panel.reload()}
        />
      ) : null}

      {statusModal ? (
        <ReturnUiStatusModal
          open
          busy={statusBusy}
          mode={statusModal.mode}
          status={statusModal.mode === "edit" ? statusModal.status : null}
          initialMainGroup={statusModal.mode === "create" ? statusModal.mainGroup : undefined}
          panelSubgroups={panel.panelSubgroups}
          onClose={() => setStatusModal(null)}
          onSaveCreate={async (body) => {
            setStatusBusy(true);
            const ok = await panel.createStatus(body);
            setStatusBusy(false);
            return ok;
          }}
          onSaveEdit={async (id, draft) => {
            setStatusBusy(true);
            const ok = await panel.saveStatus(id, draft);
            setStatusBusy(false);
            return ok;
          }}
          onUploadImage={panel.uploadImage}
          onClearImage={panel.clearImage}
        />
      ) : null}
    </div>
  );
}
