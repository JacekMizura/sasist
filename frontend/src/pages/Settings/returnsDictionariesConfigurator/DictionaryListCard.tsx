import { useState, useRef } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import type { ReturnCustomerReturnTypeDto, ReturnOrderSourceDto } from "../../../types/returnModuleConfig";
import { ORDER_SOURCE_ICONS, RETURN_TYPE_ICONS, type DictionaryKind } from "./constants";

type Row = ReturnCustomerReturnTypeDto | ReturnOrderSourceDto;

type Props = {
  title: string;
  description: string;
  addLabel: string;
  kind: DictionaryKind;
  rows: Row[];
  onAdd: () => void;
  onEdit: (row: Row) => void;
  onDelete: (row: Row) => void;
};

export function DictionaryListCard({ title, description, addLabel, kind, rows, onAdd, onEdit, onDelete }: Props) {
  const icons = kind === "return_type" ? RETURN_TYPE_ICONS : ORDER_SOURCE_ICONS;
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={onAdd}
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          {addLabel}
        </button>
      </header>
      <ul className="space-y-2 p-4">
        {sorted.map((row, i) => (
          <DictionaryItemRow
            key={row.code}
            icon={icons[i % icons.length]}
            row={row}
            onEdit={() => onEdit(row)}
            onDelete={() => onDelete(row)}
          />
        ))}
        {sorted.length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
            Brak pozycji — dodaj pierwszą.
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function DictionaryItemRow({
  icon,
  row,
  onEdit,
  onDelete,
}: {
  icon: string;
  row: Row;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/40 px-3 py-3">
      <span className="text-xl leading-none" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{row.label}</p>
        <span
          className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            row.is_active ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80" : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
          }`}
        >
          {row.is_active ? "Aktywny" : "Wyłączony"}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Edytuj
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            aria-label="Więcej akcji"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Usuń
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}
