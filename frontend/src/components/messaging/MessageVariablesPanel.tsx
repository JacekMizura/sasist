import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
    <aside className="flex max-h-[min(78vh,760px)] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:sticky lg:top-4 lg:max-w-[400px]">
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Dostępne zmienne</h2>
        <input
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
          placeholder="Szukaj zmiennej…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <p className="px-4 py-4 text-sm text-slate-500">Ładowanie…</p> : null}
        {!loading && filtered.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">Brak zmiennych dla filtra.</p>
        ) : null}
        {filtered.map((g) => {
          const isOpen = open[g.id] !== false;
          return (
            <div key={g.id} className="border-b border-slate-100 last:border-b-0">
              <button
                type="button"
                className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50/80"
                onClick={() => setOpen((s) => ({ ...s, [g.id]: !isOpen }))}
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {g.label}
              </button>
              {isOpen
                ? g.variables.map((v, idx) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => onInsert(v.token)}
                      className={`flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                        idx > 0 ? "border-t border-slate-100" : ""
                      }`}
                      title="Wstaw w miejsce kursora"
                    >
                      <span className="font-mono text-xs font-semibold text-blue-700">{v.token}</span>
                      <span className="text-xs font-medium text-slate-800">{v.label}</span>
                      {v.description ? <span className="text-[11px] leading-snug text-slate-400">{v.description}</span> : null}
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
