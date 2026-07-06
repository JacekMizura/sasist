import { useMemo, useState } from "react";

import type { EditorCatalogItem } from "../../../../api/documentTemplatesApi";
import { groupHelpers } from "../utils/helperCatalogGroups";

type Props = {
  items: EditorCatalogItem[];
  search: string;
  onInsert: (snippet: string) => void;
};

export function HelperCatalogPanel({ items, search, onInsert }: Props) {
  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () => items.filter((i) => !q || i.name.toLowerCase().includes(q) || i.insert.toLowerCase().includes(q)),
    [items, q],
  );
  const groups = useMemo(() => groupHelpers(filtered), [filtered]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleGroup(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!groups.length) {
    return <p className="text-slate-500">Brak funkcji pasujących do wyszukiwania.</p>;
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const open = !collapsed.has(group.id);
        return (
          <section key={group.id} className="rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-slate-50"
              onClick={() => toggleGroup(group.id)}
            >
              <span className="text-[10px] text-slate-400">{open ? "▼" : "▶"}</span>
              <span className="flex-1 text-xs font-medium text-slate-800">{group.label}</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{group.items.length}</span>
            </button>
            {open ? (
              <div className="space-y-0.5 border-t border-slate-100 px-2 pb-2 pt-1">
                {group.items.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50"
                    onClick={() => onInsert(item.insert)}
                  >
                    <div className="font-medium text-slate-800">{item.name}</div>
                    <div className="font-mono text-[10px] text-slate-500">{item.insert}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
