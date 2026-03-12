import { useState, useCallback, useEffect } from "react";
import api from "../../../api/axios";
import type { LabelTemplate, TemplateType } from "../../../types/labelSystem";
import { UI_STRINGS } from "../../../constants/uiStrings";
import { generatePreset, PRESET_TYPES, PRESET_LABELS, type PresetType } from "../../../services/labelPresets";

const STORAGE_KEY = "label-system-templates";

export type SavedTemplateServer = {
  id: number;
  tenant_id: number;
  name: string;
  template_type?: string | null;
  template_json: string;
  created_at: string | null;
  updated_at: string | null;
};

function generateId() {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
    } catch {}
    return [];
  });
  const [serverTemplates, setServerTemplates] = useState<SavedTemplateServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchServerTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<SavedTemplateServer[]>("/label-templates/");
      setServerTemplates(Array.isArray(res.data) ? res.data : []);
    } catch {
      setServerTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServerTemplates();
  }, [fetchServerTemplates]);

  const saveCurrent = () => {
    const next = [...saved.filter((t) => t.id !== current.id), { ...current, updatedAt: new Date().toISOString() }];
    setSaved(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const saveTemplateToServer = async () => {
    const name = (current.name || "Bez nazwy").trim();
    setSaving(true);
    try {
      await api.post("/label-templates/", {
        name,
        template_json: JSON.stringify(current),
      });
      await fetchServerTemplates();
    } catch (e) {
      console.error("Save template failed:", e);
    } finally {
      setSaving(false);
    }
  };

  const load = (t: LabelTemplate) => {
    onLoad({ ...t, id: t.id ?? generateId(), updatedAt: new Date().toISOString() });
  };

  const loadFromServer = (row: SavedTemplateServer) => {
    try {
      const t = JSON.parse(row.template_json) as LabelTemplate;
      onLoad({
        ...t,
        id: t.id ?? generateId(),
        name: row.name,
        template_type: (row.template_type ?? t.template_type) as TemplateType | undefined,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      console.error("Invalid template_json from server");
    }
  };

  const removeFromServer = async (id: number) => {
    try {
      await api.delete(`/label-templates/${id}/`);
      await fetchServerTemplates();
    } catch (e) {
      console.error("Delete template failed:", e);
    }
  };

  const remove = (id: string) => {
    const next = saved.filter((t) => t.id !== id);
    setSaved(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <div className="mt-2 rounded-2xl border border-slate-100 bg-slate-50/50 p-3 shadow-lg">
      <h3 className="text-xs font-bold text-slate-600 mb-2">{UI_STRINGS.labels.designer.templateLibrary}</h3>
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={saveCurrent}
          className="w-full px-2 py-1 rounded-lg text-[10px] bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
        >
          {UI_STRINGS.labels.designer.saveCurrent}
        </button>
        <button
          type="button"
          onClick={saveTemplateToServer}
          disabled={saving}
          className="w-full px-2 py-1 rounded-lg text-[10px] bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-60"
        >
          {saving ? "Zapisywanie…" : UI_STRINGS.labels.designer.saveTemplate}
        </button>
      </div>
      {/* Server templates — Wybierz zapisany szablon */}
      {loading ? (
        <p className="text-[10px] text-slate-500 mt-1">Ładowanie…</p>
      ) : serverTemplates.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] text-slate-600 font-semibold mb-0.5">{UI_STRINGS.labels.designer.loadSavedTemplate}</p>
          <ul className="space-y-0.5 max-h-24 overflow-y-auto rounded-lg border border-slate-100 bg-white shadow-sm py-1">
            {serverTemplates.map((row) => (
              <li key={row.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => loadFromServer(row)}
                  className="flex-1 text-left text-[10px] text-slate-700 truncate hover:underline rounded"
                >
                  {row.name}
                </button>
                <button
                  type="button"
                  onClick={() => removeFromServer(row.id)}
                  className="text-slate-500 hover:text-red-400 text-[10px] shrink-0"
                  title={UI_STRINGS.labels.designer.removeFromLibrary}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {/* Local templates */}
      <div className="mt-2">
        <p className="text-[10px] text-slate-500 mb-0.5">Lokalne</p>
      <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
        {saved.map((t) => (
          <li key={t.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => load(t)}
              className="flex-1 text-left text-[10px] text-slate-700 truncate hover:underline"
            >
              {t.name}
            </button>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="text-slate-500 hover:text-red-400 text-[10px]"
              title={UI_STRINGS.labels.designer.removeFromLibrary}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      </div>

      {/* Preset selection modal */}
      {presetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPresetModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">Create from preset</h2>
              <p className="text-sm text-slate-500 mt-0.5">Choose a warehouse label layout to start from.</p>
            </div>
            <ul className="p-2 overflow-y-auto flex-1">
              {PRESET_TYPES.map((type) => (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = generatePreset(type as PresetType);
                      if (templateId != null) onLoad({ ...next, id: String(templateId), name: current.name || next.name });
                      else onLoad(next);
                      setPresetModalOpen(false);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 border border-transparent hover:border-slate-200"
                  >
                    {PRESET_LABELS[type as PresetType]}
                  </button>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPresetModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
