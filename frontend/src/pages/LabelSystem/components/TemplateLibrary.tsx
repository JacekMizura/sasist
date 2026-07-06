import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LabelTemplate } from "../../../types/labelSystem";
import { UI_STRINGS } from "../../../constants/uiStrings";
import {
  formatPresetSpecLine,
  generatePreset,
  PRESET_LABELS,
  PRESET_TYPES,
  PRESET_USAGE_HINTS,
  type PresetType,
} from "../../../services/labelPresets";
import { generateId } from "../utils/id";
import { Bookmark, Check, LayoutTemplate, Search } from "lucide-react";
import { listSellasistToolbarToggleBtn } from "../../../components/listPage/listSellasistTokens";
import { tabsNavSegmentedItemClassName } from "../../../components/layout/TabsNav";
import { labelDesignerToolbarPrimaryBtnClass } from "../labelDesignerToolbarTokens";
import { LabelGalleryThumbnail } from "./LabelGalleryThumbnail";

const STORAGE_KEY = "label-system-templates";

/** Fixed modal shell — never shrinks with result count. */
const GALLERY_MODAL_CLASS =
  "flex h-[min(760px,90vh)] w-[min(1150px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl";

/** Fixed card tile — grid must not stretch single items. */
const GALLERY_CARD_BASE_CLASS =
  "relative flex h-[220px] w-[320px] max-w-full flex-col overflow-hidden rounded-xl border bg-white text-left shadow-sm transition-all duration-150";

const PRESET_TEMPLATE_CACHE: Partial<Record<PresetType, LabelTemplate>> = {};

function getPresetTemplate(type: PresetType): LabelTemplate {
  if (!PRESET_TEMPLATE_CACHE[type]) {
    PRESET_TEMPLATE_CACHE[type] = generatePreset(type);
  }
  return PRESET_TEMPLATE_CACHE[type]!;
}

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

function formatTemplateCount(count: number): string {
  if (count === 1) return "1 szablon";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} szablony`;
  return `${count} szablonów`;
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

  const handleSearchChange = useCallback((value: string) => {
    setGallerySearch(value);
    setSelectedPreset(null);
  }, []);

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
          className="mb-2 w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-[11px] font-semibold text-slate-700 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-100"
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
                    className="flex-1 truncate rounded px-1 py-0.5 text-left text-[10px] text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900"
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
            <header className="shrink-0 border-b border-slate-200 px-6 py-5">
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
                <div
                  className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-slate-200/90 bg-slate-100/90 p-1 shadow-inner"
                  role="tablist"
                  aria-label="Kategoria szablonu"
                >
                  {(Object.keys(CATEGORY_LABELS) as PresetCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      role="tab"
                      aria-selected={galleryCategory === cat}
                      onClick={() => handleCategoryChange(cat)}
                      className={tabsNavSegmentedItemClassName(galleryCategory === cat)}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5">
              <div className="transition-opacity duration-150 ease-in-out" style={{ opacity: listOpacity }}>
                {filteredPresets.length === 0 ? (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
                    <p className="text-base font-semibold text-slate-800">Nie znaleziono szablonów</p>
                    <p className="mt-1 max-w-sm text-sm text-slate-500">
                      Spróbuj zmienić kategorię lub wyszukiwanie.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 justify-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredPresets.map((type) => {
                      const preset = type as PresetType;
                      const isSelected = selectedPreset === preset;
                      const presetTemplate = getPresetTemplate(preset);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setSelectedPreset(preset)}
                          onDoubleClick={() => {
                            applyPreset(preset, templateId, current, onLoad);
                            closeModal();
                          }}
                          className={`${GALLERY_CARD_BASE_CLASS} ${
                            isSelected
                              ? "border-slate-900 bg-slate-50/70 shadow-md ring-1 ring-slate-900/10"
                              : "border-slate-200/90 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                          }`}
                        >
                          {isSelected ? (
                            <span
                              className="absolute right-2.5 top-2.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm"
                              aria-hidden
                            >
                              <Check className="h-3 w-3" strokeWidth={2.5} />
                            </span>
                          ) : null}
                          <LabelGalleryThumbnail
                            template={presetTemplate}
                            cacheKey={`preset:${preset}`}
                            className="h-[140px]"
                          />
                          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
                            <span className="line-clamp-1 text-[13px] font-bold text-slate-900">
                              {PRESET_LABELS[preset]}
                            </span>
                            <span className="mt-1 line-clamp-2 flex-1 text-[11px] leading-snug text-slate-500">
                              {PRESET_USAGE_HINTS[preset]}
                            </span>
                            <span className="mt-2 inline-flex w-fit max-w-full truncate rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                              {formatPresetSpecLine(preset)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
              <p className="text-sm text-slate-500">
                <span className="font-medium text-slate-700">{formatTemplateCount(filteredPresets.length)}</span>
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={closeModal} className={listSellasistToolbarToggleBtn}>
                  Anuluj
                </button>
                <button
                  type="button"
                  disabled={!selectedPreset}
                  onClick={handleUseSelected}
                  className={labelDesignerToolbarPrimaryBtnClass}
                >
                  Użyj szablonu
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
