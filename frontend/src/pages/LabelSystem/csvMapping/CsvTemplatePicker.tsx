import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { LabelTemplate } from "../../../types/labelSystem";
import { LabelGalleryThumbnail } from "../components/LabelGalleryThumbnail";
import { csvFriendlyTypeLabel } from "./csvImportPrintKinds";

export type CsvTemplatePickerItem = {
  id: number;
  name: string;
  template_type?: string | null;
  template_json?: string;
};

type Props = {
  templates: CsvTemplatePickerItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

function parseTemplate(row: CsvTemplatePickerItem): LabelTemplate | null {
  const raw = row.template_json?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LabelTemplate;
    return {
      ...parsed,
      id: String(row.id),
      name: row.name || parsed.name || "Szablon",
      widthMm: Number(parsed.widthMm) || 50,
      heightMm: Number(parsed.heightMm) || 30,
      dpi: Number(parsed.dpi) || 300,
      elements: parsed.elements ?? [],
      template_type: (row.template_type || parsed.template_type) as LabelTemplate["template_type"],
    };
  } catch {
    return null;
  }
}

/**
 * Searchable template picker for Import CSV — cards with live label thumbnails.
 */
export default function CsvTemplatePicker({ templates, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter((t) => {
      const name = (t.name ?? "").toLowerCase();
      const typeLabel = csvFriendlyTypeLabel(t.template_type).toLowerCase();
      return name.includes(needle) || typeLabel.includes(needle);
    });
  }, [templates, search]);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj szablonu"
          className="w-full border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-6 text-center text-sm text-slate-500">
          Brak szablonów dla wybranego typu wydruku.
        </p>
      ) : (
        <ul className="grid max-h-[420px] grid-cols-1 gap-2.5 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin] sm:grid-cols-2">
          {filtered.map((row) => {
            const selected = selectedId === row.id;
            const tpl = parseTemplate(row);
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onSelect(row.id)}
                  aria-pressed={selected}
                  className={[
                    "flex w-full flex-col overflow-hidden rounded-xl border bg-white text-left shadow-sm transition duration-150",
                    selected
                      ? "border-orange-400 ring-2 ring-orange-500"
                      : "border-gray-200 hover:border-orange-300 hover:shadow-md",
                  ].join(" ")}
                >
                  {tpl ? (
                    <LabelGalleryThumbnail
                      template={tpl}
                      cacheKey={`csv-pick:${row.id}:${row.name}`}
                      className="h-[100px] border-b border-gray-200"
                    />
                  ) : (
                    <div className="flex h-[100px] items-center justify-center border-b border-gray-200 text-xs text-slate-400">
                      Brak podglądu
                    </div>
                  )}
                  <div className="space-y-0.5 px-3 py-2.5">
                    <p className="line-clamp-2 text-sm font-semibold text-slate-900">{row.name}</p>
                    <p className="text-xs text-slate-500">{csvFriendlyTypeLabel(row.template_type)}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
