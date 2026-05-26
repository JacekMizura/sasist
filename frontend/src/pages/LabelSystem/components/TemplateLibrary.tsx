import { useState } from "react";
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

const STORAGE_KEY = "label-system-templates";

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

  return (
    <div className="mt-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-3 shadow-lg">
      <h3 className="mb-2 text-xs font-bold text-slate-600">{UI_STRINGS.labels.designer.templateLibrary}</h3>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={saveCurrent}
          className="w-full rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-200"
        >
          Zapisz lokalnie
        </button>
      </div>
      <div className="mt-2">
        <p className="mb-0.5 text-[10px] text-slate-500">Lokalne (tylko w tej przeglądarce)</p>
        <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
          {saved.map((t) => (
            <li key={t.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => load(t)}
                className="flex-1 truncate text-left text-[10px] text-slate-700 hover:underline"
              >
                {t.name}
              </button>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="text-[10px] text-slate-500 hover:text-red-400"
                title={UI_STRINGS.labels.designer.removeFromLibrary}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>

      {presetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setPresetModalOpen(false)}
        >
          <div
            className="mx-4 flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-lg font-semibold text-slate-800">Szybki start</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Wybierz gotowy układ etykiety magazynowej — możesz go potem dowolnie edytować i zapisać.
              </p>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2">
              {PRESET_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    const next = generatePreset(type as PresetType);
                    if (templateId != null) onLoad({ ...next, id: String(templateId), name: current.name || next.name });
                    else onLoad(next);
                    setPresetModalOpen(false);
                  }}
                  className="flex flex-col rounded-xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50 p-3 text-left shadow-sm transition hover:border-cyan-300/80 hover:shadow-md"
                >
                  <span className="text-[12px] font-bold text-slate-900">{PRESET_LABELS[type as PresetType]}</span>
                  <span className="mt-1 text-[10px] leading-snug text-slate-500">
                    {PRESET_USAGE_HINTS[type as PresetType]}
                  </span>
                  <span className="mt-2 text-[9px] font-medium text-slate-500">
                    {formatPresetSpecLine(type as PresetType)}
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t border-slate-200 px-4 py-2">
              <button
                type="button"
                onClick={() => setPresetModalOpen(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
