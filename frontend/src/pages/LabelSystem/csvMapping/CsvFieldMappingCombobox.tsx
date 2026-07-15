import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import {
  type CsvMappingFieldGroup,
  type CsvMappingUiGroupId,
  defaultExpandedCsvGroupId,
} from "./labelCsvMappingFields";

type Props = {
  value: string;
  groups: CsvMappingFieldGroup[];
  templateType?: string | null;
  onChange: (field: string) => void;
  disabled?: boolean;
};

function matchesSearch(label: string, field: string, needle: string): boolean {
  if (!needle) return true;
  const n = needle.toLowerCase();
  return label.toLowerCase().includes(n) || field.toLowerCase().includes(n);
}

/**
 * Searchable, grouped field picker for CSV → label mapping.
 * Only the group matching template type starts expanded.
 */
export default function CsvFieldMappingCombobox({
  value,
  groups,
  templateType,
  onChange,
  disabled,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const defaultGroup = defaultExpandedCsvGroupId(templateType);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of groups) init[g.group.id] = g.group.id === defaultGroup;
    return init;
  });

  const groupIdsKey = groups.map((g) => g.group.id).join("|");

  useEffect(() => {
    const next: Record<string, boolean> = {};
    const def = defaultExpandedCsvGroupId(templateType);
    for (const id of groupIdsKey.split("|").filter(Boolean)) {
      next[id] = id === def;
    }
    setExpanded(next);
  }, [templateType, groupIdsKey]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filteredGroups = useMemo(() => {
    const needle = search.trim();
    return groups
      .map((g) => ({
        ...g,
        options: g.options.filter((o) => matchesSearch(o.label, o.field, needle)),
      }))
      .filter((g) => g.options.length > 0);
  }, [groups, search]);

  const selectedLabel = useMemo(() => {
    if (!value) return "— Pomiń —";
    for (const g of groups) {
      const hit = g.options.find((o) => o.field === value);
      if (hit) return hit.label;
    }
    return value;
  }, [groups, value]);

  const pick = (field: string) => {
    onChange(field);
    setOpen(false);
    setSearch("");
  };

  const toggleGroup = (id: CsvMappingUiGroupId) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  /** While searching, auto-expand all matching groups. */
  const isGroupOpen = (id: CsvMappingUiGroupId) =>
    Boolean(search.trim()) || Boolean(expanded[id]);

  return (
    <div ref={rootRef} className="relative min-w-[180px]">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded border border-[#E2E8F0] bg-white px-2 py-1.5 text-left text-xs text-[#1E293B] hover:border-slate-300 disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-1 max-h-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <label className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj pola..."
              className="w-full border-0 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
            />
          </label>

          <div className="max-h-56 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => pick("")}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1">— Pomiń —</span>
              {!value ? <Check className="h-3.5 w-3.5 text-cyan-600" /> : null}
            </button>

            {filteredGroups.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-500">Brak pól dla tego szablonu / wyszukiwania.</p>
            ) : (
              filteredGroups.map(({ group, options }) => {
                const openGroup = isGroupOpen(group.id);
                return (
                  <div key={group.id} className="border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className="flex w-full items-center gap-2 bg-slate-50/80 px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-100"
                    >
                      <span className="flex-1">{group.label}</span>
                      <span className="tabular-nums text-slate-400">{options.length}</span>
                      <span className="text-slate-400">{openGroup ? "▼" : "▶"}</span>
                    </button>
                    {openGroup
                      ? options.map((o) => {
                          const selected = value === o.field;
                          return (
                            <button
                              key={o.field}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => pick(o.field)}
                              className={[
                                "flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-cyan-50",
                                selected ? "bg-cyan-50/80 font-medium text-cyan-900" : "text-slate-800",
                              ].join(" ")}
                            >
                              <span className="min-w-0 flex-1 truncate">{o.label}</span>
                              <span className="shrink-0 font-mono text-[10px] text-slate-400">{o.field}</span>
                              {selected ? <Check className="h-3.5 w-3.5 shrink-0 text-cyan-600" /> : null}
                            </button>
                          );
                        })
                      : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
