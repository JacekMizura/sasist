import type { LabelTemplate, TemplateType } from "../../../types/labelSystem";
import { TEMPLATE_TYPE_OPTIONS } from "../../../types/labelSystem";

const MAX_LABEL_MM = 2000;

export type LabelToolbarProps = {
  template: LabelTemplate;
  onTemplateChange: (t: LabelTemplate) => void;
  saving: boolean;
  handleSave: () => void;
  onBack?: () => void;
  setPresetModalOpen: (open: boolean) => void;
};

export function LabelToolbar({
  template,
  onTemplateChange,
  saving,
  handleSave,
  onBack,
  setPresetModalOpen,
}: LabelToolbarProps) {
  return (
    <div className="shrink-0 flex items-center gap-4 px-4 py-2 bg-white border-b border-[#E2E8F0]">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          ← Szablony
        </button>
      )}
      <button
        type="button"
        onClick={() => setPresetModalOpen(true)}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
      >
        Create from preset
      </button>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 uppercase">Nazwa</label>
        <input
          type="text"
          value={template.name}
          onChange={(e) => onTemplateChange({ ...template, name: e.target.value, updatedAt: new Date().toISOString() })}
          className="w-48 rounded border border-[#E2E8F0] bg-slate-50 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 uppercase">Typ</label>
        <select
          value={template.template_type ?? "location"}
          onChange={(e) => onTemplateChange({ ...template, template_type: e.target.value as TemplateType, updatedAt: new Date().toISOString() })}
          className="rounded border border-[#E2E8F0] bg-slate-50 px-2 py-1 text-sm"
        >
          {TEMPLATE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 uppercase">Wymiary (mm)</label>
        <input
          type="number"
          min={10}
          max={MAX_LABEL_MM}
          value={template.widthMm}
          onChange={(e) => onTemplateChange({ ...template, widthMm: Math.min(MAX_LABEL_MM, Math.max(10, Number(e.target.value) || 50)), updatedAt: new Date().toISOString() })}
          className="w-16 rounded border border-[#E2E8F0] bg-slate-50 px-2 py-1 text-sm"
        />
        <span className="text-slate-400">×</span>
        <input
          type="number"
          min={10}
          max={MAX_LABEL_MM}
          value={template.heightMm}
          onChange={(e) => onTemplateChange({ ...template, heightMm: Math.min(MAX_LABEL_MM, Math.max(10, Number(e.target.value) || 30)), updatedAt: new Date().toISOString() })}
          className="w-16 rounded border border-[#E2E8F0] bg-slate-50 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500 uppercase">DPI</label>
        <input
          type="number"
          min={72}
          max={600}
          value={template.dpi}
          onChange={(e) => onTemplateChange({ ...template, dpi: Number(e.target.value) || 300, updatedAt: new Date().toISOString() })}
          className="w-16 rounded border border-[#E2E8F0] bg-slate-50 px-2 py-1 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="ml-auto px-4 py-1.5 rounded-lg text-sm font-semibold bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-60"
      >
        {saving ? "Zapisywanie…" : "Zapisz szablon"}
      </button>
    </div>
  );
}
