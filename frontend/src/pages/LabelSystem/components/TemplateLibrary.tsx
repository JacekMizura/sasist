import { useMemo, useState } from "react";
import type { LabelTemplate } from "../../../types/labelSystem";
import { UI_STRINGS } from "../../../constants/uiStrings";
import {
  formatPresetSpecLine,
  generatePreset,
  PRESET_LABELS,
  PRESET_TYPES,
  PRESET_USAGE_HINTS,
  PRESET_CARD_META,
  type PresetType,
} from "../../../services/labelPresets";
import { generateId } from "../utils/id";
import { Search, LayoutTemplate, Bookmark } from "lucide-react";

const STORAGE_KEY = "label-system-templates";

type PresetCategory = "location" | "rack" | "fleet" | "all";

const PRESET_CATEGORY: Record<PresetType, PresetCategory> = {
  LOCATION_BASIC: "location",
  LOCATION_BARCODE_LARGE: "location",
  FLOOR_LOCATION: "location",
  AISLE_LABEL: "location",
  RACK_SEGMENT_STRIP: "rack",
  RACK_BEAM_MULTISECTION: "rack",
  PALLET_LABEL: "fleet",
};

const CATEGORY_LABELS: Record<PresetCategory, string> = {
  all: "Wszystkie",
  location: "Lokalizacja",
  rack: "Regał",
  fleet: "Paleta / wózek",
};

function PresetThumbnail({ type }: { type: PresetType }) {
  const meta = PRESET_CARD_META[type];
  const aspect = meta.widthMm / Math.max(meta.heightMm, 1);
  const w = aspect >= 2 ? 72 : aspect >= 1 ? 56 : 40;
  const h = Math.round(w / aspect);
  return (
    <div
      className="mx-auto flex items-center justify-center rounded-md border border-slate-200/80 bg-gradient-to-br from-white to-slate-100 shadow-inner"
      style={{ width: w, height: Math.min(h, 48) }}
      aria-hidden
    >
      <div className="h-[55%] w-[75%] rounded-sm border border-slate-300/60 bg-white shadow-sm">
        <div className="m-0.5 h-1 w-3/4 rounded-sm bg-cyan-400/70" />
        <div className="mx-0.5 mt-0.5 h-2 rounded-sm bg-slate-200" />
      </div>
    </div>
  );
}

export function TemplateLibrary({
  current,
  onLoad,
  presetModalOpen,
  setPresetModalOpen,
  templateId,
}: {
  current: LabelTemplate;
  onLoad: (t: LabelTemplate) => void;
  presetModalOpen: boolean;
  setPresetModalOpen: (open: boolean) => void;
  templateId?: number;
}) {
  const [saved, setSaved] = useState<LabelTemplate[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore invalid localStorage */
    }
    return [];
  });
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryCategory, setGalleryCategory] = useState<PresetCategory>("all");

  const saveCurrent = () => {
    const next = [...saved.filter((t) => t.id !== current.id), { ...current, updatedAt: new Date().toISOString() }];
    setSaved(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const load = (t: LabelTemplate) => {
    onLoad({ ...t, id: t.id ?? generateId(), updatedAt: new Date().toISOString() });
  };

  const remove = (id: string) => {
    const next = saved.filter((t) => t.id !== id);
    setSaved(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const filteredPresets = useMemo(() => {
    const needle = gallerySearch.trim().toLowerCase();
    return PRESET_TYPES.filter((type) => {
      if (galleryCategory !== "all" && PRESET_CATEGORY[type] !== galleryCategory) return false;
      if (!needle) return true;
      const label = PRESET_LABELS[type].toLowerCase();
      const hint = PRESET_USAGE_HINTS[type].toLowerCase();
      return label.includes(needle) || hint.includes(needle);
    });
  }, [gallerySearch, galleryCategory]);

  return (
    <>
      <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <LayoutTemplate className="h-3.5 w-3.5 text-slate-500" strokeWidth={2} aria-hidden />
          <h3 className="text-[11px] font-semibold text-slate-800">{UI_STRINGS.labels.designer.templateLibrary}</h3>
        </div>
        <button
          type="button"
          onClick={() => setPresetModalOpen(true)}
          className="mb-2 w-full rounded-lg border border-dashed border-cyan-300/80 bg-cyan-50/40 px-2 py-2 text-[11px] font-semibold text-cyan-900 transition-colors duration-150 hover:border-cyan-400 hover:bg-cyan-50"
        >
          Przeglądaj galerię szablonów
        </button>
        <button
          type="button"
          onClick={saveCurrent}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-100"
        >
          <Bookmark className="h-3 w-3" strokeWidth={2} aria-hidden />
          Zapisz lokalnie
        </button>
        {saved.length > 0 ? (
          <div className="mt-2">
            <p className="mb-1 text-[9px] font-medium uppercase tracking-wide text-slate-400">Zapisane lokalnie</p>
            <ul className="max-h-24 space-y-0.5 overflow-y-auto">
              {saved.map((t) => (
                <li key={t.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => load(t)}
                    className="flex-1 truncate rounded px-1 py-0.5 text-left text-[10px] text-slate-700 transition-colors hover:bg-slate-100 hover:text-cyan-800"
                  >
                    {t.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    className="rounded px-1 text-[10px] text-slate-400 transition-colors hover:text-red-500"
                    title={UI_STRINGS.labels.designer.removeFromLibrary}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {presetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
          onClick={() => setPresetModalOpen(false)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Galeria szablonów</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Wybierz gotowy układ — możesz go potem dowolnie edytować i zapisać.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                  <input
                    value={gallerySearch}
                    onChange={(e) => setGallerySearch(e.target.value)}
                    placeholder="Szukaj szablonu…"
                    className="w-full border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </label>
                <div className="flex flex-wrap gap-1">
                  {(Object.keys(CATEGORY_LABELS) as PresetCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setGalleryCategory(cat)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-150 ${
                        galleryCategory === cat
                          ? "bg-cyan-600 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPresets.length === 0 ? (
                <p className="col-span-full py-8 text-center text-sm text-slate-500">Brak szablonów dla wybranych filtrów.</p>
              ) : (
                filteredPresets.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      const next = generatePreset(type as PresetType);
                      if (templateId != null) onLoad({ ...next, id: String(templateId), name: current.name || next.name });
                      else onLoad(next);
                      setPresetModalOpen(false);
                    }}
                    className="flex flex-col rounded-xl border border-slate-200/90 bg-white p-3 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-cyan-300/80 hover:shadow-md"
                  >
                    <PresetThumbnail type={type as PresetType} />
                    <span className="mt-2 text-[12px] font-bold text-slate-900">{PRESET_LABELS[type as PresetType]}</span>
                    <span className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-500">
                      {PRESET_USAGE_HINTS[type as PresetType]}
                    </span>
                    <span className="mt-2 inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-medium text-slate-600">
                      {formatPresetSpecLine(type as PresetType)}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setPresetModalOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-100"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
