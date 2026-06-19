import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Plus } from "lucide-react";

import type { ReturnModuleConfigDto, ReturnProductDecisionDto } from "../../../types/returnModuleConfig";
import { AdvancedCodeField, AdvancedSettingsPanel } from "./AdvancedSettingsPanel";
import { productDecisionEffects } from "./businessLabels";
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

  const saveRow = (next: ReturnProductDecisionDto, mode: "create" | "edit", original?: ReturnProductDecisionDto) => {
    if (mode === "create") {
      setDraft({ ...cfg, product_decisions: [...cfg.product_decisions, next] });
    } else if (original) {
      setDraft({
        ...cfg,
        product_decisions: cfg.product_decisions.map((r) =>
          r.code === original.code && r.category === original.category ? next : r,
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
        eyebrow="Sekcja 2"
        title="Decyzje produktowe"
        description="Co operator może zrobić z pojedynczą pozycją zwrotu — w języku biznesowym, bez skrótów systemowych."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <DecisionColumn
            title="Przyjęcia"
            subtitle="Pozytywne rozstrzygnięcia pozycji"
            rows={accepted}
            onAdd={() => setModal({ mode: "create", category: "ACCEPTED" })}
            onEdit={(row) => setModal({ mode: "edit", row })}
          />
          <DecisionColumn
            title="Odrzucenia"
            subtitle="Negatywne rozstrzygnięcia pozycji"
            rows={rejected}
            onAdd={() => setModal({ mode: "create", category: "REJECTED" })}
            onEdit={(row) => setModal({ mode: "edit", row })}
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
}: {
  title: string;
  subtitle: string;
  rows: ReturnProductDecisionDto[];
  onAdd: () => void;
  onEdit: (row: ReturnProductDecisionDto) => void;
}) {
  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <DecisionCard key={`${row.category}-${row.code}`} row={row} onEdit={() => onEdit(row)} />
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

function DecisionCard({ row, onEdit }: { row: ReturnProductDecisionDto; onEdit: () => void }) {
  const effectLines = productDecisionEffects(row);
  return (
    <button
      type="button"
      className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow ${
        row.is_active ? "border-slate-200/90" : "border-slate-100 opacity-70"
      }`}
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-semibold text-slate-900">{row.label}</p>
        {!row.is_active ? (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
            Nieaktywna
          </span>
        ) : null}
      </div>
      <ul className="mt-3 space-y-1">
        {effectLines.map((line) => (
          <li key={line} className={`text-sm ${line.startsWith("✕") ? "text-slate-500" : "text-emerald-800"}`}>
            {line}
          </li>
        ))}
      </ul>
    </button>
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

  return (
    <ReturnsConfiguratorModalShell
      open
      title={mode === "create" ? "Nowa decyzja produktowa" : "Edytuj decyzję"}
      subtitle="Nazwa i zachowanie widoczne dla operatora magazynu."
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
            onClick={() => onSave({ ...draft, label: draft.label.trim() }, mode, row)}
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

        <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Efekt biznesowy</p>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={draft.is_active}
              onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
            />
            Decyzja aktywna — dostępna przy obsłudze zwrotu
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={draft.visible_wms}
              onChange={(e) => setDraft((d) => ({ ...d, visible_wms: e.target.checked }))}
            />
            Widoczna dla magazyniera na terminalu WMS
          </label>
          {draft.category === "REJECTED" ? (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300"
                checked={draft.creates_stock_document === true}
                onChange={(e) => setDraft((d) => ({ ...d, creates_stock_document: e.target.checked }))}
              />
              Przyjmij produkt na magazyn mimo odrzucenia (dokument PZ ze zwrotu)
            </label>
          ) : null}
        </div>

        <AdvancedSettingsPanel>
          <AdvancedCodeField
            label="Identyfikator systemowy (code)"
            value={draft.code}
            onChange={(v) => setDraft((d) => ({ ...d, code: v.trim() }))}
            hint="Używany w integracjach — zwykle nie wymaga zmiany."
          />
          <label className="block text-xs font-medium text-slate-600">
            Kolejność wyświetlania
            <input
              type="number"
              className="mt-1 w-full max-w-[8rem] rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={draft.sort_order}
              onChange={(e) => setDraft((d) => ({ ...d, sort_order: Number(e.target.value) }))}
            />
          </label>
        </AdvancedSettingsPanel>
      </div>
    </ReturnsConfiguratorModalShell>
  );
}
