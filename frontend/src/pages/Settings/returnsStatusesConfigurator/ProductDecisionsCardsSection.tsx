import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Plus } from "lucide-react";

import type { ReturnModuleConfigDto, ReturnProductDecisionDto } from "../../../types/returnModuleConfig";
import { productDecisionBusinessOutcome } from "./businessLabels";
import { ConfiguratorSectionShell } from "./ConfiguratorSectionShell";
import { ReturnsConfiguratorModalShell } from "./ReturnsConfiguratorModalShell";

type Props = {
  cfg: ReturnModuleConfigDto;
  setDraft: Dispatch<SetStateAction<ReturnModuleConfigDto | null>>;
};

export function ProductDecisionsCardsSection({ cfg, setDraft }: Props) {
  const [modal, setModal] = useState<{ mode: "create" | "edit"; row?: ReturnProductDecisionDto; category?: "ACCEPTED" | "REJECTED" } | null>(
    null,
  );

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
      <ConfiguratorSectionShell
        id="decyzje-produktowe"
        title="Decyzje produktowe"
        description="Co operator wybiera dla pojedynczej pozycji zwrotu — efekt widoczny na karcie, bez ustawień technicznych."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <DecisionColumn
            title="Przyjęcia"
            subtitle="Pozytywne rozstrzygnięcia pozycji"
            rows={accepted}
            onAdd={() => setModal({ mode: "create", category: "ACCEPTED" })}
            onEdit={(row) => setModal({ mode: "edit", row })}
            onToggleActive={(row, active) => patchRow(row, { is_active: active })}
          />
          <DecisionColumn
            title="Odrzucenia"
            subtitle="Negatywne rozstrzygnięcia pozycji"
            rows={rejected}
            onAdd={() => setModal({ mode: "create", category: "REJECTED" })}
            onEdit={(row) => setModal({ mode: "edit", row })}
            onToggleActive={(row, active) => patchRow(row, { is_active: active })}
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

function DecisionColumn({
  title,
  subtitle,
  rows,
  onAdd,
  onEdit,
  onToggleActive,
}: {
  title: string;
  subtitle: string;
  rows: ReturnProductDecisionDto[];
  onAdd: () => void;
  onEdit: (row: ReturnProductDecisionDto) => void;
  onToggleActive: (row: ReturnProductDecisionDto, active: boolean) => void;
}) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <DecisionCard key={`${row.category}-${row.code}`} row={row} onEdit={() => onEdit(row)} onToggleActive={onToggleActive} />
        ))}
        {rows.length === 0 ? <p className="text-sm text-slate-400">Brak decyzji w tej kategorii.</p> : null}
      </div>
      <button
        type="button"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        onClick={onAdd}
      >
        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
        Dodaj decyzję
      </button>
    </div>
  );
}

function DecisionCard({
  row,
  onEdit,
  onToggleActive,
}: {
  row: ReturnProductDecisionDto;
  onEdit: () => void;
  onToggleActive: (row: ReturnProductDecisionDto, active: boolean) => void;
}) {
  const outcome = productDecisionBusinessOutcome(row);
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm transition ${
        row.is_active ? "border-slate-200/90" : "border-slate-100 opacity-75"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onEdit}>
          <p className="text-base font-semibold text-slate-900">{row.label}</p>
          <p className={`mt-2 text-sm ${row.is_active ? "text-slate-600" : "text-slate-400"}`}>{outcome}</p>
        </button>
        <label
          className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-slate-600"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={row.is_active}
            onChange={(e) => onToggleActive(row, e.target.checked)}
          />
          Aktywna
        </label>
      </div>
    </div>
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
      creates_stock_document: false,
    },
  );

  const handleSave = () => {
    const next: ReturnProductDecisionDto = {
      ...draft,
      label: draft.label.trim(),
      is_active: row?.is_active ?? true,
      visible_wms: row?.visible_wms ?? true,
      code: row?.code ?? draft.code,
      sort_order: row?.sort_order ?? draft.sort_order,
    };
    onSave(next, mode, row);
  };

  return (
    <ReturnsConfiguratorModalShell
      open
      title={mode === "create" ? "Nowa decyzja produktowa" : "Edytuj decyzję"}
      subtitle="Nazwa widoczna dla operatora magazynu."
      onClose={onClose}
      footer={
        <>
          {mode === "edit" && onDelete ? (
            <button type="button" className="mr-auto rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50" onClick={onDelete}>
              Usuń
            </button>
          ) : null}
          <button type="button" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={!draft.label.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-45"
            onClick={handleSave}
          >
            Zapisz
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block text-xs font-medium text-slate-600">
          Nazwa decyzji
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            autoFocus
          />
        </label>

        <label className="block text-xs font-medium text-slate-600">
          Kategoria
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as "ACCEPTED" | "REJECTED" }))}
          >
            <option value="ACCEPTED">Przyjęcie / wymiana / zwrot środków</option>
            <option value="REJECTED">Odrzucenie pozycji</option>
          </select>
        </label>

        {draft.category === "REJECTED" ? (
          <label className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={draft.creates_stock_document === true}
              onChange={(e) => setDraft((d) => ({ ...d, creates_stock_document: e.target.checked }))}
            />
            <span>
              <span className="font-medium text-slate-900">Produkt wraca na magazyn</span>
              <span className="mt-0.5 block text-xs text-slate-500">Twórz przyjęcie magazynowe po zwrocie, mimo odrzucenia pozycji.</span>
            </span>
          </label>
        ) : null}

        {mode === "create" ? (
          <p className="text-xs text-slate-500">Nowa decyzja jest domyślnie aktywna — możesz wyłączyć ją przełącznikiem na liście.</p>
        ) : null}
      </div>
    </ReturnsConfiguratorModalShell>
  );
}
