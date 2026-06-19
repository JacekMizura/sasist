import { useState, type Dispatch, type SetStateAction } from "react";

import type { ReturnModuleConfigDto } from "../../../types/returnModuleConfig";
import type { ReturnUiMainGroup, ReturnUiStatusWithCount } from "../../../types/wmsReturn";
import { DamageCardsSection } from "./DamageCardsSection";
import { ListLabelsSection } from "./ListLabelsSection";
import { ProductDecisionsCardsSection } from "./ProductDecisionsCardsSection";
import { ReturnPanelSubgroupModal } from "./ReturnPanelSubgroupModal";
import { ReturnUiStatusModal } from "./ReturnUiStatusModal";
import { RmzWorkflowProcessSection } from "./RmzWorkflowProcessSection";
import { useReturnPanelStatusesConfig } from "./useReturnPanelStatusesConfig";

type Props = {
  warehouseId: number | null;
  cfg: ReturnModuleConfigDto;
  setDraft: Dispatch<SetStateAction<ReturnModuleConfigDto | null>>;
};

const SECTION_NAV = [
  { id: "etykiety-listy", label: "Etykiety listy" },
  { id: "decyzje-produktowe", label: "Decyzje produktowe" },
  { id: "statusy-rmz", label: "Statusy RMZ" },
  { id: "uszkodzenia", label: "Uszkodzenia" },
] as const;

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
    <div className="space-y-8">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Konfigurator statusów zwrotów</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
          Ustaw etykiety listy, decyzje produktowe, etapy procesu RMZ i typy uszkodzeń — w języku biznesowym, bez technicznych tabel.
          Etykiety listy i etapy RMZ zapisują się od razu; decyzje i uszkodzenia — przyciskiem na dole strony.
        </p>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Sekcje konfiguratora">
          {SECTION_NAV.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {s.label}
            </a>
          ))}
        </nav>
      </header>

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

      <RmzWorkflowProcessSection warehouseId={warehouseId} />

      <DamageCardsSection cfg={cfg} setDraft={setDraft} />

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
