import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import type { ReturnModuleConfigDto, ReturnProductDecisionDto } from "../../../types/returnModuleConfig";
import { PRODUCT_DECISION_DOT } from "./constants";
import { ReturnsConfiguratorModalShell } from "./ReturnsConfiguratorModalShell";

type Props = {
  cfg: ReturnModuleConfigDto;
  setDraft: Dispatch<SetStateAction<ReturnModuleConfigDto | null>>;
};

export function ProductDecisionsTableSection({ cfg, setDraft }: Props) {
  const [modal, setModal] = useState<{ mode: "create" | "edit"; row?: ReturnProductDecisionDto } | null>(null);

  const rows = useMemo(
    () => [...cfg.product_decisions].sort((a, b) => a.sort_order - b.sort_order),
    [cfg.product_decisions],
  );

  const removeRow = (row: ReturnProductDecisionDto) => {
    if (!window.confirm(`Usunąć decyzję „${row.label}”?`)) return;
    setDraft({
      ...cfg,
      product_decisions: cfg.product_decisions.filter((r) => r.code !== row.code || r.category !== row.category),
    });
  };

  return (
    <>
      <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-slate-900">Decyzje produktowe</h3>
            <p className="mt-1 text-sm text-slate-500">Etykiety decyzji na pozycji zwrotu — WMS i panel biurowy.</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => setModal({ mode: "create" })}
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Dodaj decyzję
          </button>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-semibold">Nazwa decyzji</th>
                <th className="px-3 py-3 text-center">WMS</th>
                <th className="px-3 py-3 text-center">Aktywny</th>
                <th className="px-3 py-3">Powiązanie</th>
                <th className="px-4 py-3 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.category}-${row.code}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-medium text-slate-900">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${PRODUCT_DECISION_DOT[i % PRODUCT_DECISION_DOT.length]}`} aria-hidden />
                      {row.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <BoolIcon ok={row.visible_wms} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <BoolIcon ok={row.is_active} />
                  </td>
                  <td className="px-3 py-3 text-slate-600">{row.creates_stock_document ? "Z-PZ" : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        title="Edytuj"
                        onClick={() => setModal({ mode: "edit", row })}
                      >
                        <Pencil className="h-4 w-4" strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                        title="Usuń"
                        onClick={() => removeRow(row)}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                    Brak decyzji — dodaj pierwszą.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {modal ? (
        <ProductDecisionModal
          mode={modal.mode}
          row={modal.row}
          cfg={cfg}
          onClose={() => setModal(null)}
          onSave={(next) => {
            if (modal.mode === "create") {
              setDraft({ ...cfg, product_decisions: [...cfg.product_decisions, next] });
            } else if (modal.row) {
              setDraft({
                ...cfg,
                product_decisions: cfg.product_decisions.map((r) =>
                  r.code === modal.row!.code && r.category === modal.row!.category ? next : r,
                ),
              });
            }
            setModal(null);
          }}
        />
      ) : null}
    </>
  );
}

function BoolIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <Check className="mx-auto h-4 w-4 text-emerald-600" strokeWidth={2.5} aria-label="Tak" />
  ) : (
    <X className="mx-auto h-4 w-4 text-slate-300" strokeWidth={2} aria-label="Nie" />
  );
}

function ProductDecisionModal({
  mode,
  row,
  cfg,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  row?: ReturnProductDecisionDto;
  cfg: ReturnModuleConfigDto;
  onClose: () => void;
  onSave: (next: ReturnProductDecisionDto) => void;
}) {
  const acceptedMax = cfg.product_decisions.filter((p) => p.category === "ACCEPTED").length;
  const rejectedMax = cfg.product_decisions.filter((p) => p.category === "REJECTED").length;

  const [draft, setDraft] = useState<ReturnProductDecisionDto>(() =>
    row ?? {
      category: "ACCEPTED",
      code: `pd_${Date.now()}`,
      label: "",
      visible_wms: true,
      sort_order: (acceptedMax ? acceptedMax : rejectedMax) * 10 + 10,
      is_active: true,
      creates_stock_document: false,
    },
  );

  return (
    <ReturnsConfiguratorModalShell
      open
      title={mode === "create" ? "Nowa decyzja produktowa" : "Edytuj decyzję"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={!draft.label.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-45"
            onClick={() => onSave({ ...draft, label: draft.label.trim() })}
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
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Kategoria
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={draft.category}
            onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value as "ACCEPTED" | "REJECTED" }))}
          >
            <option value="ACCEPTED">Przyjęcie / zamiana</option>
            <option value="REJECTED">Odrzucenie</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draft.visible_wms} onChange={(e) => setDraft((d) => ({ ...d, visible_wms: e.target.checked }))} />
            Widoczny w WMS
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))} />
            Aktywny
          </label>
          {draft.category === "REJECTED" ? (
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draft.creates_stock_document === true}
                onChange={(e) => setDraft((d) => ({ ...d, creates_stock_document: e.target.checked }))}
              />
              Z-PZ (przyjęcie ze zwrotu)
            </label>
          ) : null}
        </div>
        <details className="rounded-lg border border-slate-100 bg-slate-50/80 text-xs">
          <summary className="cursor-pointer px-3 py-2 font-medium text-slate-500">Zaawansowane — identyfikator</summary>
          <div className="border-t border-slate-100 px-3 py-2">
            <input
              className="w-full rounded border border-slate-200 px-2 py-1 font-mono text-[11px]"
              value={draft.code}
              onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.trim() }))}
            />
          </div>
        </details>
      </div>
    </ReturnsConfiguratorModalShell>
  );
}
