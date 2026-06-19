import { useEffect, useState } from "react";
import { ArrowDown, Plus } from "lucide-react";

import type { ReturnStatusCreatePayload, ReturnStatusRead, ReturnStatusType, ReturnStatusUpdatePayload } from "../../../types/wmsReturn";
import { AdvancedCodeField, AdvancedSettingsPanel } from "./AdvancedSettingsPanel";
import {
  RMZ_COLOR_OPTIONS,
  RMZ_TYPE_OPTIONS,
  rmzColorBadgeClass,
  rmzColorLabelPl,
  rmzTypeLabelPl,
} from "./businessLabels";
import { ConfiguratorSectionShell } from "./ConfiguratorSectionShell";
import { ReturnsConfiguratorModalShell } from "./ReturnsConfiguratorModalShell";
import { useReturnRmzWorkflowConfig } from "./useReturnRmzWorkflowConfig";

type Props = {
  warehouseId: number | null;
};

export function RmzWorkflowProcessSection({ warehouseId }: Props) {
  const wf = useReturnRmzWorkflowConfig(warehouseId);
  const [modal, setModal] = useState<
    | { mode: "create" }
    | { mode: "edit"; row: ReturnStatusRead }
    | null
  >(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <ConfiguratorSectionShell
        id="statusy-rmz"
        eyebrow="Sekcja 3"
        title="Statusy RMZ"
        description="Proces obsługi dokumentu zwrotu — od przyjęcia do zamknięcia. Kolejność odzwierciedla typowy przebieg pracy."
        action={
          <button
            type="button"
            disabled={warehouseId == null}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-45"
            onClick={() => setModal({ mode: "create" })}
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Dodaj etap
          </button>
        }
      >
        {wf.err ? <p className="mb-4 text-sm text-red-700">{wf.err}</p> : null}
        {wf.loading && wf.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Wczytywanie procesu RMZ…</p>
        ) : wf.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Brak etapów — dodaj pierwszy lub utworzą się domyślne przy pierwszym zwrocie.</p>
        ) : (
          <div className="mx-auto max-w-md">
            {wf.rows.map((row, i) => (
              <div key={row.id} className="flex flex-col items-center">
                <ProcessStageCard row={row} onEdit={() => setModal({ mode: "edit", row })} />
                {i < wf.rows.length - 1 ? (
                  <ArrowDown className="my-2 h-5 w-5 text-slate-300" strokeWidth={2} aria-hidden />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </ConfiguratorSectionShell>

      {modal ? (
        <ReturnRmzStatusModal
          open
          busy={busy}
          mode={modal.mode}
          row={modal.mode === "edit" ? modal.row : null}
          onClose={() => setModal(null)}
          onSaveCreate={async (body) => {
            setBusy(true);
            const ok = await wf.createStatus(body);
            setBusy(false);
            if (ok) setModal(null);
            return ok;
          }}
          onSaveEdit={async (id, payload) => {
            setBusy(true);
            const ok = await wf.saveStatus(id, payload);
            setBusy(false);
            if (ok) setModal(null);
            return ok;
          }}
          onDelete={
            modal.mode === "edit"
              ? async () => {
                  setBusy(true);
                  const ok = await wf.removeStatus(modal.row.id);
                  setBusy(false);
                  if (ok) setModal(null);
                  return ok;
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}

function ProcessStageCard({ row, onEdit }: { row: ReturnStatusRead; onEdit: () => void }) {
  return (
    <button
      type="button"
      className="w-full rounded-xl border border-slate-200/90 bg-white px-5 py-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
      onClick={onEdit}
    >
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${rmzColorBadgeClass(row.color)}`}
        >
          {rmzColorLabelPl(row.color)}
        </span>
        <span className="min-w-0 flex-1 text-base font-semibold text-slate-900">{row.name}</span>
      </div>
      <p className="mt-2 text-xs text-slate-500">{rmzTypeLabelPl(row.type)}</p>
    </button>
  );
}

function ReturnRmzStatusModal({
  open,
  busy,
  mode,
  row,
  onClose,
  onSaveCreate,
  onSaveEdit,
  onDelete,
}: {
  open: boolean;
  busy: boolean;
  mode: "create" | "edit";
  row: ReturnStatusRead | null;
  onClose: () => void;
  onSaveCreate: (body: ReturnStatusCreatePayload) => Promise<boolean>;
  onSaveEdit: (id: number, payload: ReturnStatusUpdatePayload) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("blue");
  const [type, setType] = useState<ReturnStatusType>("in_progress");
  const [transitionKey, setTransitionKey] = useState("");

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && row) {
      setName(row.name);
      setColor(row.color);
      setType(row.type);
      setTransitionKey(row.transition_key ?? "");
    } else {
      setName("");
      setColor("blue");
      setType("in_progress");
      setTransitionKey("");
    }
  }, [open, mode, row]);

  const handleSave = async () => {
    if (!name.trim()) return;
    if (mode === "create") {
      await onSaveCreate({
        name: name.trim(),
        color: color.trim() || "blue",
        type,
        transition_key: transitionKey.trim() || null,
      });
    } else if (row) {
      await onSaveEdit(row.id, {
        name: name.trim(),
        color: color.trim() || "blue",
        type,
        transition_key: transitionKey.trim() || null,
      });
    }
  };

  return (
    <ReturnsConfiguratorModalShell
      open={open}
      busy={busy}
      title={mode === "create" ? "Nowy etap procesu" : "Edytuj etap procesu"}
      subtitle="Nazwa i kolor widoczne na liście zwrotów i w magazynie."
      onClose={onClose}
      footer={
        <>
          {mode === "edit" && onDelete ? (
            <button
              type="button"
              disabled={busy}
              className="mr-auto rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-45"
              onClick={() => void onDelete()}
            >
              Usuń etap
            </button>
          ) : null}
          <button type="button" disabled={busy} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-45"
            onClick={() => void handleSave()}
          >
            {busy ? "Zapisywanie…" : "Zapisz"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block text-xs font-medium text-slate-600">
          Nazwa etapu
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Kolor etykiety
          <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={color} onChange={(e) => setColor(e.target.value)}>
            {RMZ_COLOR_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${rmzColorBadgeClass(color)}`}>
            Podgląd: {name.trim() || "Nazwa etapu"}
          </span>
        </div>

        <AdvancedSettingsPanel>
          <label className="block text-xs font-medium text-slate-600">
            Typ workflow (logika systemu)
            <select className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value as ReturnStatusType)}>
              {RMZ_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">{RMZ_TYPE_OPTIONS.find((o) => o.value === type)?.hint}</p>
          </label>
          <AdvancedCodeField
            label="Klucz przejścia (transition_key)"
            value={transitionKey}
            onChange={setTransitionKey}
            hint="Używany przez automatyzacje — zostaw puste, jeśli nie wiesz po co to pole."
          />
          {mode === "edit" && row ? (
            <p className="text-[11px] text-slate-500">Identyfikator rekordu: {row.id}</p>
          ) : null}
        </AdvancedSettingsPanel>
      </div>
    </ReturnsConfiguratorModalShell>
  );
}
