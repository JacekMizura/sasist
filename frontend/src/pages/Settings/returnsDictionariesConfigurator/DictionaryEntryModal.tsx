import { useEffect, useState } from "react";

import type { ReturnCustomerReturnTypeDto, ReturnOrderSourceDto } from "../../../types/returnModuleConfig";
import { ReturnsConfiguratorModalShell } from "../returnsStatusesConfigurator/ReturnsConfiguratorModalShell";
import type { DictionaryKind } from "./constants";

const inp = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300";
const lab = "block text-xs font-medium text-slate-600";

type Entry = ReturnCustomerReturnTypeDto | ReturnOrderSourceDto;

type Props = {
  open: boolean;
  mode: "create" | "edit";
  kind: DictionaryKind;
  row: Entry | null;
  defaultSortOrder: number;
  onClose: () => void;
  onSave: (entry: Entry) => void;
};

function emptyEntry(kind: DictionaryKind, sortOrder: number): Entry {
  if (kind === "return_type") {
    return { code: `rodzaj_${Date.now()}`, label: "", sort_order: sortOrder, is_active: true };
  }
  return { code: `zrodlo_${Date.now()}`, label: "", sort_order: sortOrder, is_active: true };
}

export function DictionaryEntryModal({ open, mode, kind, row, defaultSortOrder, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<Entry>(() => row ?? emptyEntry(kind, defaultSortOrder));

  useEffect(() => {
    if (open) setDraft(row ?? emptyEntry(kind, defaultSortOrder));
  }, [open, row, kind, defaultSortOrder]);

  const title =
    kind === "return_type"
      ? mode === "create"
        ? "Nowy rodzaj zwrotu"
        : "Edytuj rodzaj zwrotu"
      : mode === "create"
        ? "Nowe źródło"
        : "Edytuj źródło";

  return (
    <ReturnsConfiguratorModalShell
      open={open}
      title={title}
      subtitle={kind === "return_type" ? "Widoczne dla klienta jako powód zwrotu." : "Kanał sprzedaży w formularzu zwrotu."}
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
        <label className={lab}>
          Nazwa
          <input className={inp} value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
        </label>
        <div className="flex flex-wrap items-center gap-6">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={draft.is_active}
              onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
            />
            Aktywny
          </label>
          <label className={lab}>
            Kolejność
            <input
              type="number"
              className={`${inp} max-w-[8rem]`}
              value={draft.sort_order}
              onChange={(e) => setDraft((d) => ({ ...d, sort_order: Number(e.target.value) }))}
            />
          </label>
        </div>
        <details className="rounded-lg border border-slate-100 bg-slate-50/80 text-xs">
          <summary className="cursor-pointer px-3 py-2 font-medium text-slate-500">Zaawansowane — identyfikator systemowy</summary>
          <div className="border-t border-slate-100 px-3 py-2">
            <input
              className="w-full rounded border border-slate-200 px-2 py-1 font-mono text-[11px]"
              value={draft.code}
              onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.trim() }))}
              spellCheck={false}
            />
          </div>
        </details>
      </div>
    </ReturnsConfiguratorModalShell>
  );
}
