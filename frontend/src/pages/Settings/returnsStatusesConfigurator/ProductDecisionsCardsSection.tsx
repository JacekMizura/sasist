import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import {
  Checkbox,
  DangerButton,
  FORM_FIELD_DENSITY,
  FormField,
  GhostButton,
  Input,
  PrimaryButton,
  Select,
} from "@/design-system";
import { IconButton } from "../../../design-system";
import type { ReturnModuleConfigDto, ReturnProductDecisionDto } from "../../../types/returnModuleConfig";
import { decisionReturnsToStock } from "./businessLabels";
import { ConfiguratorSectionShell } from "./ConfiguratorSectionShell";
import { ReturnsConfiguratorModalShell } from "./ReturnsConfiguratorModalShell";

type Props = {
  cfg: ReturnModuleConfigDto;
  setDraft: Dispatch<SetStateAction<ReturnModuleConfigDto | null>>;
};

export function ProductDecisionsCardsSection({ cfg, setDraft }: Props) {
  const [modal, setModal] = useState<{
    mode: "create" | "edit";
    row?: ReturnProductDecisionDto;
    category?: "ACCEPTED" | "REJECTED";
  } | null>(null);

  const accepted = useMemo(
    () => [...cfg.product_decisions].filter((p) => p.category === "ACCEPTED").sort((a, b) => a.sort_order - b.sort_order),
    [cfg.product_decisions],
  );
  const rejected = useMemo(
    () => [...cfg.product_decisions].filter((p) => p.category === "REJECTED").sort((a, b) => a.sort_order - b.sort_order),
    [cfg.product_decisions],
  );

  const patchRow = (row: ReturnProductDecisionDto, patch: Partial<ReturnProductDecisionDto>) => {
    setDraft({
      ...cfg,
      product_decisions: cfg.product_decisions.map((r) =>
        r.code === row.code && r.category === row.category ? { ...r, ...patch } : r,
      ),
    });
  };

  const saveRow = (next: ReturnProductDecisionDto, mode: "create" | "edit", original?: ReturnProductDecisionDto) => {
    const withDefaults: ReturnProductDecisionDto = {
      ...next,
      visible_wms: original?.visible_wms ?? true,
      is_active: next.is_active ?? original?.is_active ?? true,
    };
    if (mode === "create") {
      setDraft({ ...cfg, product_decisions: [...cfg.product_decisions, withDefaults] });
    } else if (original) {
      setDraft({
        ...cfg,
        product_decisions: cfg.product_decisions.map((r) =>
          r.code === original.code && r.category === original.category ? withDefaults : r,
        ),
      });
    }
    setModal(null);
  };

  const removeRow = (row: ReturnProductDecisionDto) => {
    if (!window.confirm(`Usunąć decyzję „${row.label}”?`)) return;
    setDraft({
      ...cfg,
      product_decisions: cfg.product_decisions.filter((r) => r.code !== row.code || r.category !== row.category),
    });
  };

  return (
    <>
      <ConfiguratorSectionShell id="decyzje-produktowe" title="Decyzje produktowe">
        <div className="space-y-8">
          <DecisionMatrix
            title="Przyjęcia"
            rows={accepted}
            onAdd={() => setModal({ mode: "create", category: "ACCEPTED" })}
            onEdit={(row) => setModal({ mode: "edit", row })}
            onToggleActive={(row, active) => patchRow(row, { is_active: active })}
            onToggleReturn={(row, returns) => patchRow(row, { creates_stock_document: returns })}
            onDelete={removeRow}
          />
          <DecisionMatrix
            title="Odrzucenia"
            rows={rejected}
            onAdd={() => setModal({ mode: "create", category: "REJECTED" })}
            onEdit={(row) => setModal({ mode: "edit", row })}
            onToggleActive={(row, active) => patchRow(row, { is_active: active })}
            onToggleReturn={(row, returns) => patchRow(row, { creates_stock_document: returns })}
            onDelete={removeRow}
          />
        </div>
      </ConfiguratorSectionShell>

      {modal ? (
        <ProductDecisionModal
          mode={modal.mode}
          row={modal.row}
          defaultCategory={modal.category ?? "ACCEPTED"}
          cfg={cfg}
          onClose={() => setModal(null)}
          onSave={saveRow}
          onDelete={modal.row ? () => removeRow(modal.row!) : undefined}
        />
      ) : null}
    </>
  );
}

function DecisionMatrix({
  title,
  rows,
  onAdd,
  onEdit,
  onToggleActive,
  onToggleReturn,
  onDelete,
}: {
  title: string;
  rows: ReturnProductDecisionDto[];
  onAdd: () => void;
  onEdit: (row: ReturnProductDecisionDto) => void;
  onToggleActive: (row: ReturnProductDecisionDto, active: boolean) => void;
  onToggleReturn: (row: ReturnProductDecisionDto, returns: boolean) => void;
  onDelete: (row: ReturnProductDecisionDto) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-900">{title}</h3>
        <IconButton density="compact" title={`Dodaj decyzję — ${title}`} aria-label={`Dodaj decyzję — ${title}`} onClick={onAdd}>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
        </IconButton>
      </div>

      <div className="w-full overflow-x-auto border-t border-slate-100">
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] font-semibold text-slate-500">
              <th className="px-2 py-1.5 font-semibold text-slate-600">Decyzja</th>
              <th className="w-24 px-1 py-1.5 text-center font-semibold text-slate-600">Aktywna</th>
              <th className="w-36 px-1 py-1.5 text-center font-semibold text-slate-600">Powrót na magazyn</th>
              <th className="w-16 px-1 py-1.5 text-center font-semibold text-slate-600">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const returns = decisionReturnsToStock(row);
              return (
                <tr
                  key={`${row.category}-${row.code}`}
                  className={`border-b border-slate-50 last:border-0 ${row.is_active ? "hover:bg-slate-50/70" : "opacity-55"}`}
                >
                  <td className="px-2 py-1.5 font-medium text-slate-800">{row.label}</td>
                  <td className="px-1 py-1.5 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                      checked={row.is_active}
                      aria-label={`${row.label} — aktywna`}
                      onChange={(e) => onToggleActive(row, e.target.checked)}
                    />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                      checked={returns}
                      aria-label={`${row.label} — powrót na magazyn`}
                      onChange={(e) => onToggleReturn(row, e.target.checked)}
                    />
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <div className="inline-flex items-center justify-center gap-0.5">
                      <IconButton
                        density="compact"
                        title="Edytuj decyzję"
                        aria-label={`Edytuj ${row.label}`}
                        onClick={() => onEdit(row)}
                      >
                        <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </IconButton>
                      <IconButton
                        density="compact"
                        tone="danger"
                        title="Usuń decyzję"
                        aria-label={`Usuń ${row.label}`}
                        onClick={() => onDelete(row)}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-xs italic text-slate-400">
                  Brak decyzji
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProductDecisionModal({
  mode,
  row,
  defaultCategory,
  cfg,
  onClose,
  onSave,
  onDelete,
}: {
  mode: "create" | "edit";
  row?: ReturnProductDecisionDto;
  defaultCategory: "ACCEPTED" | "REJECTED";
  cfg: ReturnModuleConfigDto;
  onClose: () => void;
  onSave: (next: ReturnProductDecisionDto, mode: "create" | "edit", original?: ReturnProductDecisionDto) => void;
  onDelete?: () => void;
}) {
  const acceptedMax = cfg.product_decisions.filter((p) => p.category === "ACCEPTED").length;
  const rejectedMax = cfg.product_decisions.filter((p) => p.category === "REJECTED").length;

  const [draft, setDraft] = useState<ReturnProductDecisionDto>(() =>
    row ?? {
      category: defaultCategory,
      code: `pd_${Date.now()}`,
      label: "",
      visible_wms: true,
      sort_order: (defaultCategory === "ACCEPTED" ? acceptedMax : rejectedMax) * 10 + 10,
      is_active: true,
      creates_stock_document: defaultCategory === "ACCEPTED",
    },
  );

  const handleSave = () => {
    onSave(
      {
        ...draft,
        label: draft.label.trim(),
        code: row?.code ?? draft.code,
        sort_order: row?.sort_order ?? draft.sort_order,
        visible_wms: draft.visible_wms ?? true,
      },
      mode,
      row,
    );
  };

  return (
    <ReturnsConfiguratorModalShell
      open
      title={mode === "create" ? "Nowa decyzja" : "Edytuj decyzję"}
      onClose={onClose}
      footer={
        <>
          {mode === "edit" && onDelete ? (
            <DangerButton type="button" density="compact" className="mr-auto" onClick={onDelete}>
              Usuń
            </DangerButton>
          ) : null}
          <GhostButton type="button" onClick={onClose}>
            Anuluj
          </GhostButton>
          <PrimaryButton type="button" disabled={!draft.label.trim()} onClick={handleSave}>
            Zapisz
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Nazwa">
          <Input
            density={FORM_FIELD_DENSITY}
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            autoFocus
          />
        </FormField>

        <FormField label="Kategoria">
          <Select
            density={FORM_FIELD_DENSITY}
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as "ACCEPTED" | "REJECTED" }))}
          >
            <option value="ACCEPTED">Przyjęcie</option>
            <option value="REJECTED">Odrzucenie</option>
          </Select>
        </FormField>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox
            checked={draft.is_active}
            onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
          />
          Aktywna
        </label>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <Checkbox
            className="mt-0.5"
            checked={decisionReturnsToStock(draft)}
            onChange={(e) => setDraft((d) => ({ ...d, creates_stock_document: e.target.checked }))}
          />
          <span>
            <span className="font-medium text-slate-900">Produkt wraca na magazyn</span>
            <span className="mt-0.5 block text-xs text-slate-500">Twórz przyjęcie magazynowe po zwrocie</span>
          </span>
        </label>
      </div>
    </ReturnsConfiguratorModalShell>
  );
}
