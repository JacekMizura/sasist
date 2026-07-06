import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/** Fixed modal shell — never shrinks with result count. */
const GALLERY_MODAL_CLASS =
  "flex h-[min(760px,90vh)] w-[min(1150px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl";

/** Fixed card tile — grid must not stretch single items. */
const GALLERY_CARD_CLASS =
  "flex h-[220px] w-[320px] max-w-full flex-col rounded-xl border bg-white p-4 text-left shadow-sm transition-all duration-150";

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
  const w = aspect >= 2 ? 80 : aspect >= 1 ? 64 : 48;
  const h = Math.round(w / aspect);
  return (
    <div
      className="flex h-[72px] shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-gradient-to-br from-white to-slate-100 shadow-inner"
      aria-hidden
    >
      <div
        className="flex items-center justify-center rounded-md border border-slate-300/60 bg-white shadow-sm"
        style={{ width: w, height: Math.min(h, 52) }}
      >
        <div className="h-[55%] w-[75%] rounded-sm border border-slate-200/80 bg-white">
          <div className="m-0.5 h-1 w-3/4 rounded-sm bg-cyan-400/70" />
          <div className="mx-0.5 mt-0.5 h-2 rounded-sm bg-slate-200" />
        </div>
      </div>
    </div>
  );
}

function applyPreset(
  type: PresetType,
  templateId: number | undefined,
  current: LabelTemplate,
  onLoad: (t: LabelTemplate) => void,
) {
  const next = generatePreset(type);
  if (templateId != null) onLoad({ ...next, id: String(templateId), name: current.name || next.name });
  else onLoad(next);
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
  const [selectedPreset, setSelectedPreset] = useState<PresetType | null>(null);
  const [listOpacity, setListOpacity] = useState(1);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const closeModal = useCallback(() => {
    setPresetModalOpen(false);
    setSelectedPreset(null);
    setGallerySearch("");
    setGalleryCategory("all");
    setListOpacity(1);
  }, [setPresetModalOpen]);

  const runListFade = useCallback((apply: () => void) => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    setListOpacity(0);
    fadeTimerRef.current = setTimeout(() => {
      apply();
      setListOpacity(1);
      fadeTimerRef.current = null;
    }, 150);
  }, []);

  const handleCategoryChange = useCallback(
    (cat: PresetCategory) => {
      if (cat === galleryCategory) return;
      runListFade(() => {
        setGalleryCategory(cat);
        setSelectedPreset(null);
      });
    },
    [galleryCategory, runListFade],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setGallerySearch(value);
      setSelectedPreset(null);
    },
    [],
  );

  useEffect(() => {
    if (!presetModalOpen) return;
    setSelectedPreset(null);
    setGallerySearch("");
    setGalleryCategory("all");
    setListOpacity(1);
  }, [presetModalOpen]);

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const handleUseSelected = () => {
    if (!selectedPreset) return;
    applyPreset(selectedPreset, templateId, current, onLoad);
    closeModal();
  };

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
          onClick={closeModal}
          role="presentation"
        >
          <div
            className={GALLERY_MODAL_CLASS}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-gallery-title"
          >
            {/* ── Header (pinned) ── */}
            <header className="shrink-0 border-b border-slate-100 px-6 py-5">
              <h2 id="template-gallery-title" className="text-lg font-semibold text-slate-900">
                Galeria szablonów
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Wybierz gotowy układ — możesz go potem dowolnie edytować i zapisać.
              </p>
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                  <input
                    value={gallerySearch}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Szukaj szablonu…"
                    className="w-full border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(CATEGORY_LABELS) as PresetCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleCategoryChange(cat)}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors duration-150 ${
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
            </header>

            {/* ── Scrollable list only ── */}
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5">
              <div
                className="transition-opacity duration-150 ease-in-out"
                style={{ opacity: listOpacity }}
              >
                {filteredPresets.length === 0 ? (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
                    <span className="text-4xl leading-none" aria-hidden>
                      📄
                    </span>
                    <p className="mt-4 text-base font-semibold text-slate-800">Nie znaleziono szablonów</p>
                    <p className="mt-1 max-w-sm text-sm text-slate-500">
                      Spróbuj zmienić kategorię lub wyszukiwanie.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 justify-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredPresets.map((type) => {
                      const preset = type as PresetType;
                      const isSelected = selectedPreset === preset;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setSelectedPreset(preset)}
                          onDoubleClick={() => {
                            applyPreset(preset, templateId, current, onLoad);
                            closeModal();
                          }}
                          className={`${GALLERY_CARD_CLASS} ${
                            isSelected
                              ? "border-cyan-400 bg-cyan-50/30 ring-2 ring-cyan-400/40"
                              : "border-slate-200/90 hover:border-cyan-300/80 hover:shadow-md"
                          }`}
                        >
                          <PresetThumbnail type={preset} />
                          <span className="mt-3 line-clamp-1 text-[13px] font-bold text-slate-900">
                            {PRESET_LABELS[preset]}
                          </span>
                          <span className="mt-1 line-clamp-2 flex-1 text-[11px] leading-snug text-slate-500">
                            {PRESET_USAGE_HINTS[preset]}
                          </span>
                          <span className="mt-2 inline-flex w-fit max-w-full truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {formatPresetSpecLine(preset)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Footer (pinned) ── */}
            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={!selectedPreset}
                onClick={handleUseSelected}
                className="rounded-lg bg-gradient-to-b from-cyan-500 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:from-cyan-400 hover:to-cyan-500 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Użyj szablonu
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
