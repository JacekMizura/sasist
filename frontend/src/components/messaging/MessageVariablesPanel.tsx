import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MessageTemplateVariableGroupDto } from "../../api/messageTemplatesApi";
import { typography } from "../../design-system";

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
    <aside className="flex max-h-[min(78vh,760px)] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:sticky lg:top-4 lg:w-[340px] lg:max-w-[360px] lg:shrink-0">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3.5">
        <h2 className={`${typography.h2}`}>Dostępne zmienne</h2>
        <input
          className="mt-2.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
          placeholder="Szukaj zmiennej…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? <p className={`px-4 py-5 ${typography.bodyMuted}`}>Ładowanie…</p> : null}
        {!loading && filtered.length === 0 ? (
          <p className={`px-4 py-5 ${typography.bodyMuted}`}>Brak zmiennych dla filtra.</p>
        ) : null}
        {filtered.map((g) => {
          const isOpen = open[g.id] !== false;
          return (
            <div key={g.id}>
              <button
                type="button"
                className={`flex w-full items-center gap-1.5 border-y border-slate-100 bg-slate-50/90 px-4 py-2 text-left ${typography.section} hover:bg-slate-100/80`}
                onClick={() => setOpen((s) => ({ ...s, [g.id]: !isOpen }))}
              >
                {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                {g.label}
              </button>
              {isOpen
                ? g.variables.map((v, idx) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => onInsert(v.token)}
                      className={`flex w-full flex-col gap-0.5 bg-white px-4 py-2.5 text-left transition-colors hover:bg-slate-50 ${
                        idx > 0 ? "border-t border-slate-100" : ""
                      }`}
                      title="Wstaw w miejsce kursora"
                    >
                      <span className="font-mono text-[13px] font-semibold text-blue-700">{v.token}</span>
                      <span className="text-sm font-medium text-slate-900">{v.label}</span>
                      {v.description ? <span className={typography.caption}>{v.description}</span> : null}
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
