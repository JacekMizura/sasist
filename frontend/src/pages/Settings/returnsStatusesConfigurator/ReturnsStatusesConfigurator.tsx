import { useState, type Dispatch, type SetStateAction } from "react";

import { flatSectionsStackClass } from "../../../components/layout/flatSectionTokens";
import type { ReturnModuleConfigDto } from "../../../types/returnModuleConfig";
import type { ReturnUiMainGroup, ReturnUiStatusWithCount } from "../../../types/wmsReturn";
import { DamageCardsSection } from "./DamageCardsSection";
import { ListLabelsSection } from "./ListLabelsSection";
import { ProductDecisionsCardsSection } from "./ProductDecisionsCardsSection";
import { ReturnPanelSubgroupModal } from "./ReturnPanelSubgroupModal";
import { ReturnUiStatusModal } from "./ReturnUiStatusModal";
import { useReturnPanelStatusesConfig } from "./useReturnPanelStatusesConfig";
import { WorkflowMagazynowySection } from "./WorkflowMagazynowySection";

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
        Wybierz magazyn w górnym pasku, aby konfigurować proces zwrotów.
      </div>
    );
  }

  return (
    <div className={flatSectionsStackClass}>
      {panel.err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{panel.err}</div>
      ) : null}

      {panel.loading && !panel.summary ? (
        <p className="py-8 text-center text-sm text-slate-500">Wczytywanie konfiguracji…</p>
      ) : (
        <ListLabelsSection
          summary={panel.summary}
          panelSubgroups={panel.panelSubgroups}
          onAddSubgroup={(mg) => setSubgroupModal(mg)}
          onAddStatus={(mg) => setStatusModal({ mode: "create", mainGroup: mg })}
          onEditStatus={(s) => setStatusModal({ mode: "edit", status: s })}
        />
      )}

      <ProductDecisionsCardsSection cfg={cfg} setDraft={setDraft} />

      <DamageCardsSection cfg={cfg} setDraft={setDraft} />

      <WorkflowMagazynowySection warehouseId={warehouseId} />

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
          summary={panel.summary}
          warehouseId={warehouseId}
          onClose={() => setStatusModal(null)}
          onSaveCreate={async (body) => {
            setStatusBusy(true);
            const id = await panel.createStatus(body);
            setStatusBusy(false);
            return id;
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
