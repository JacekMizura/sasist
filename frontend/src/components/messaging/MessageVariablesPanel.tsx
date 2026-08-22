import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CornerDownLeft } from "lucide-react";
import type { MessageTemplateVariableGroupDto } from "../../api/messageTemplatesApi";

type Props = {
  groups: MessageTemplateVariableGroupDto[];
  loading?: boolean;
  onInsert: (token: string) => void;
};

export function MessageVariablesPanel({ groups, loading, onInsert }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((g) => ({
        ...g,
        variables: g.variables.filter(
          (v) =>
            v.key.toLowerCase().includes(needle) ||
            v.label.toLowerCase().includes(needle) ||
            v.description.toLowerCase().includes(needle) ||
            v.token.toLowerCase().includes(needle),
        ),
      }))
      .filter((g) => g.variables.length > 0);
  }, [groups, q]);

  return (
    <aside className="flex max-h-[min(70vh,720px)] w-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm lg:max-w-[400px]">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Dostępne zmienne</h2>
        <input
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          placeholder="Szukaj zmiennej…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading ? <p className="px-2 py-4 text-sm text-slate-500">Ładowanie…</p> : null}
        {!loading && filtered.length === 0 ? (
          <p className="px-2 py-4 text-sm text-slate-500">Brak zmiennych dla filtra.</p>
        ) : null}
        {filtered.map((g) => {
          const isOpen = open[g.id] !== false;
          return (
            <div key={g.id} className="mb-1">
              <button
                type="button"
                className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
                onClick={() => setOpen((s) => ({ ...s, [g.id]: !isOpen }))}
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {g.label}
              </button>
              {isOpen
                ? g.variables.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => onInsert(v.token)}
                      className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                      title="Wstaw w miejsce kursora"
                    >
                      <CornerDownLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                      <span className="min-w-0">
                        <span className="block font-mono text-xs font-medium text-blue-700 underline decoration-dashed underline-offset-2">
                          {v.token}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-600">{v.label}</span>
                        <span className="block text-[11px] text-slate-400">{v.description}</span>
                      </span>
                    </button>
                  ))
                : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
