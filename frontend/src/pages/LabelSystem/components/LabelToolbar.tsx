import { useState } from "react";
import type { LabelTemplate } from "../../../types/labelSystem";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import {
  LABEL_DESIGNER_TYPE_OPTIONS,
  labelDesignerTypeLabel,
  isLabelDesignerTypeValue,
} from "../labelDesignerTypeOptions";
import {
  labelDesignerToolbarInputClass,
  labelDesignerToolbarNumericClass,
  labelDesignerToolbarPrimaryBtnClass,
  labelDesignerToolbarSecondaryBtnClass,
} from "../labelDesignerToolbarTokens";
import { LabelDesignerToolbarSelect } from "./LabelDesignerToolbarSelect";
import { LabelDesignerMoreMenu, type LabelDesignerMoreMenuHandlers } from "./LabelDesignerMoreMenu";

const MAX_LABEL_MM = 2000;

export type DesignerViewMode = "edit" | "preview";

export type LabelToolbarProps = {
  template: LabelTemplate;
  onTemplateChange: (t: LabelTemplate) => void;
  saving: boolean;
  handleSave: () => void;
  onBack?: () => void;
  setPresetModalOpen: (open: boolean) => void;
  saveDisabled?: boolean;
  viewMode: DesignerViewMode;
  onViewModeChange: (mode: DesignerViewMode) => void;
  moreMenuHandlers: LabelDesignerMoreMenuHandlers;
};

function ToolbarFieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{children}</span>
  );
}

function ToolbarFieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-2.5 shadow-sm">
      <ToolbarFieldLabel>{label}</ToolbarFieldLabel>
      {children}
    </div>
  );
}

export function LabelToolbar({
  template,
  onTemplateChange,
  saving,
  handleSave,
  onBack,
  setPresetModalOpen,
  saveDisabled = false,
  viewMode,
  onViewModeChange,
  moreMenuHandlers,
}: LabelToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const typeValue = isLabelDesignerTypeValue(template.template_type)
    ? (template.template_type as string)
    : "location";

  const typeOptions = LABEL_DESIGNER_TYPE_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  }));

  if (!typeOptions.some((o) => o.value === typeValue)) {
    typeOptions.unshift({ value: typeValue, label: labelDesignerTypeLabel(typeValue) });
  }

  return (
    <header className="shrink-0 border-b border-slate-200/90 bg-white/95 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {onBack ? (
            <button type="button" onClick={onBack} className={`${labelDesignerToolbarSecondaryBtnClass} gap-1.5 px-3`}>
              <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              <span className="hidden sm:inline">Szablony</span>
            </button>
          ) : null}
          <input
            type="text"
            value={template.name}
            onChange={(e) =>
              onTemplateChange({ ...template, name: e.target.value, updatedAt: new Date().toISOString() })
            }
            placeholder="Nazwa szablonu"
            className={`${labelDesignerToolbarInputClass} min-w-0 max-w-[min(100%,14rem)] flex-1 sm:max-w-[20rem]`}
          />
          <button
            type="button"
            onClick={() => setPresetModalOpen(true)}
            className={`${labelDesignerToolbarSecondaryBtnClass} hidden px-3 lg:inline-flex`}
          >
            Galeria szablonów
          </button>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <ToolbarFieldGroup label="Typ">
            <LabelDesignerToolbarSelect
              ariaLabel="Typ etykiety"
              value={typeValue}
              options={typeOptions}
              minWidthClass="min-w-[9rem]"
              className="!h-8 !border-0 !bg-transparent !px-0 !shadow-none !ring-0 focus:!ring-0"
              onChange={(nextType) => {
                onTemplateChange({
                  ...template,
                  template_type: nextType,
                  updatedAt: new Date().toISOString(),
                });
              }}
            />
          </ToolbarFieldGroup>
          <ToolbarFieldGroup label="Rozmiar">
            <input
              type="number"
              inputMode="numeric"
              className={`${labelDesignerToolbarNumericClass} !h-8 w-14 !border-slate-200/80 !px-2 text-center text-[13px]`}
              value={Math.round(template.widthMm)}
              onChange={(e) =>
                onTemplateChange({
                  ...template,
                  widthMm: Math.round(Math.min(MAX_LABEL_MM, Math.max(10, Number(e.target.value) || 50))),
                  updatedAt: new Date().toISOString(),
                })
              }
            />
            <span className="text-slate-400">×</span>
            <input
              type="number"
              inputMode="numeric"
              className={`${labelDesignerToolbarNumericClass} !h-8 w-14 !border-slate-200/80 !px-2 text-center text-[13px]`}
              value={Math.round(template.heightMm)}
              onChange={(e) =>
                onTemplateChange({
                  ...template,
                  heightMm: Math.round(Math.min(MAX_LABEL_MM, Math.max(10, Number(e.target.value) || 30))),
                  updatedAt: new Date().toISOString(),
                })
              }
            />
            <span className="text-[11px] text-slate-400">mm</span>
          </ToolbarFieldGroup>
          <ToolbarFieldGroup label="DPI">
            <input
              type="number"
              inputMode="numeric"
              className={`${labelDesignerToolbarNumericClass} !h-8 w-16 !border-slate-200/80 !px-2 text-center text-[13px]`}
              value={template.dpi}
              onChange={(e) =>
                onTemplateChange({
                  ...template,
                  dpi: Number(e.target.value) || 300,
                  updatedAt: new Date().toISOString(),
                })
              }
            />
          </ToolbarFieldGroup>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className={`flex h-10 items-center rounded-lg border border-slate-200/90 bg-slate-50 p-0.5 shadow-sm`}>
            <button
              type="button"
              onClick={() => onViewModeChange("edit")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition-all duration-150 ${
                viewMode === "edit"
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Edycja
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("preview")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition-all duration-150 ${
                viewMode === "preview"
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Podgląd
            </button>
          </div>
          <LabelDesignerMoreMenu open={moreOpen} onOpenChange={setMoreOpen} handlers={moreMenuHandlers} />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || saveDisabled}
            title={saveDisabled ? "Popraw błędy walidacji przed zapisaniem" : undefined}
            className={labelDesignerToolbarPrimaryBtnClass}
          >
            {saving ? "Zapisywanie…" : "Zapisz"}
          </button>
        </div>
      </div>
    </header>
  );
}
