import { useState, type ChangeEvent } from "react";
import type { LabelTemplate, TemplateType } from "../../../types/labelSystem";
import { TEMPLATE_TYPE_OPTIONS } from "../../../types/labelSystem";
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { ChevronDown, Settings2, Eye, ArrowLeft } from "lucide-react";

const MAX_LABEL_MM = 2000;

const MORE_MENU_PANEL =
  "z-[8000] w-[min(100vw-2rem,20rem)] rounded-xl border border-slate-200/90 bg-white p-3 shadow-xl ring-1 ring-slate-900/5 outline-none";

export type LabelToolbarProps = {
  template: LabelTemplate;
  onTemplateChange: (t: LabelTemplate) => void;
  saving: boolean;
  handleSave: () => void;
  onBack?: () => void;
  setPresetModalOpen: (open: boolean) => void;
  saveDisabled?: boolean;
  templateMeta?: { group_id: number | null };
  onTemplateMetaChange?: (meta: { group_id: number | null }) => void;
  groups?: Array<{ id: number; name: string }>;
  autoSliceStrip: boolean;
  setAutoSliceStrip: (v: boolean) => void;
  groupedLocationVariables: boolean;
  setGroupedLocationVariables: (v: boolean) => void;
  isLocationTemplate: boolean;
  handleImportSvgFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleImportBackgroundImageChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onOpenPreview: () => void;
};

export function LabelToolbar({
  template,
  onTemplateChange,
  saving,
  handleSave,
  onBack,
  setPresetModalOpen,
  saveDisabled = false,
  templateMeta,
  onTemplateMetaChange,
  groups = [],
  autoSliceStrip,
  setAutoSliceStrip,
  groupedLocationVariables,
  setGroupedLocationVariables,
  isLocationTemplate,
  handleImportSvgFileChange,
  handleImportBackgroundImageChange,
  onOpenPreview,
}: LabelToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: moreOpen,
    onOpenChange: setMoreOpen,
    placement: "bottom-end",
    strategy: "fixed",
    middleware: [
      offset(8),
      flip({
        fallbackPlacements: ["top-end", "bottom-start", "top-start"],
        padding: 8,
      }),
      shift({ padding: 12 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const dismiss = useDismiss(context, {
    ancestorScroll: true,
    outsidePress: true,
    escapeKey: true,
  });

  const { getFloatingProps } = useInteractions([dismiss]);

  return (
    <header className="shrink-0 border-b border-slate-200/90 bg-white/95 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-2.5 text-[12px] font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              <span className="hidden sm:inline">Szablony</span>
            </button>
          )}
          <div className="flex min-w-0 max-w-[min(100%,14rem)] flex-col gap-0.5 sm:max-w-[18rem]">
            <label className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Nazwa szablonu</label>
            <input
              type="text"
              value={template.name}
              onChange={(e) =>
                onTemplateChange({ ...template, name: e.target.value, updatedAt: new Date().toISOString() })
              }
              className="h-9 w-full rounded-lg border border-slate-200/90 bg-slate-50/80 px-2.5 text-[13px] font-medium text-slate-900 shadow-inner outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-300/40"
            />
          </div>
          <button
            type="button"
            onClick={() => setPresetModalOpen(true)}
            className="hidden h-9 shrink-0 items-center rounded-lg border border-dashed border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-600 hover:border-cyan-300 hover:text-cyan-800 sm:inline-flex"
          >
            Utwórz z szablonu
          </button>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-50/90 px-2 py-1 ring-1 ring-slate-100">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Typ</span>
            <select
              value={template.template_type ?? "location"}
              onChange={(e) => {
                const nextType = e.target.value as TemplateType;
                onTemplateMetaChange?.({ group_id: null });
                onTemplateChange({
                  ...template,
                  template_type: nextType,
                  updatedAt: new Date().toISOString(),
                });
              }}
              className="max-w-[9rem] cursor-pointer rounded-md border-0 bg-transparent py-0.5 text-[12px] font-medium text-slate-800 outline-none"
            >
              {TEMPLATE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-50/90 px-2 py-1 ring-1 ring-slate-100">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">mm</span>
            <input
              type="number"
              className="w-14 rounded-md border border-slate-200/80 bg-white px-1 py-0.5 text-center text-[12px] font-medium tabular-nums"
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
              className="w-14 rounded-md border border-slate-200/80 bg-white px-1 py-0.5 text-center text-[12px] font-medium tabular-nums"
              value={Math.round(template.heightMm)}
              onChange={(e) =>
                onTemplateChange({
                  ...template,
                  heightMm: Math.round(Math.min(MAX_LABEL_MM, Math.max(10, Number(e.target.value) || 30))),
                  updatedAt: new Date().toISOString(),
                })
              }
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-50/90 px-2 py-1 ring-1 ring-slate-100">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">DPI</span>
            <input
              type="number"
              className="w-14 rounded-md border border-slate-200/80 bg-white px-1 py-0.5 text-center text-[12px] font-medium tabular-nums"
              value={template.dpi}
              onChange={(e) =>
                onTemplateChange({
                  ...template,
                  dpi: Number(e.target.value) || 300,
                  updatedAt: new Date().toISOString(),
                })
              }
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setPresetModalOpen(true)}
            className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:hidden"
          >
            Szablon
          </button>
          <button
            type="button"
            ref={refs.setReference}
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className="inline-flex list-none cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-2.5 py-2 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Settings2 className="h-3.5 w-3.5 text-slate-500" strokeWidth={2} aria-hidden />
            Więcej
            <ChevronDown className="h-3 w-3 text-slate-400" strokeWidth={2} aria-hidden />
          </button>
          {moreOpen && (
            <FloatingPortal>
              <div ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()} className={MORE_MENU_PANEL}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Import i opcje</p>
                <div className="mt-2 space-y-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-700">Tło wektorowe (SVG)</span>
                    <input type="file" accept=".svg" onChange={handleImportSvgFileChange} className="text-[11px] file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-[11px]" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium text-slate-700">Tło rastrowe (PNG / JPEG)</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleImportBackgroundImageChange}
                      className="text-[11px] file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-[11px]"
                    />
                  </div>
                  <label className="flex cursor-pointer items-start gap-2 text-[11px] text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-slate-300"
                      checked={autoSliceStrip}
                      onChange={(e) => setAutoSliceStrip(e.target.checked)}
                    />
                    <span>Automatycznie tnij pasek etykiet (import obrazu)</span>
                  </label>
                  {isLocationTemplate && (
                    <label className="flex cursor-pointer items-start gap-2 text-[11px] text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-slate-300"
                        checked={groupedLocationVariables}
                        onChange={(e) => setGroupedLocationVariables(e.target.checked)}
                      />
                      <span>Podgląd: etykieta zgrupowana (CSV, piętra 1–3)</span>
                    </label>
                  )}
                  {onTemplateMetaChange && (
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Grupa szablonów</label>
                      <select
                        value={templateMeta?.group_id ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          onTemplateMetaChange({ group_id: v === "" ? null : Number(v) });
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[12px]"
                      >
                        <option value="">Bez grupy</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="border-t border-slate-100 pt-2 md:hidden">
                    <p className="text-[10px] font-semibold text-slate-500">Typ i wymiary</p>
                    <select
                      value={template.template_type ?? "location"}
                      onChange={(e) => {
                        const nextType = e.target.value as TemplateType;
                        onTemplateMetaChange?.({ group_id: null });
                        onTemplateChange({
                          ...template,
                          template_type: nextType,
                          updatedAt: new Date().toISOString(),
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12px]"
                    >
                      {TEMPLATE_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-[12px]"
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
                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-[12px]"
                        value={Math.round(template.heightMm)}
                        onChange={(e) =>
                          onTemplateChange({
                            ...template,
                            heightMm: Math.round(Math.min(MAX_LABEL_MM, Math.max(10, Number(e.target.value) || 30))),
                            updatedAt: new Date().toISOString(),
                          })
                        }
                      />
                    </div>
                    <input
                      type="number"
                      className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-[12px]"
                      placeholder="DPI"
                      value={template.dpi}
                      onChange={(e) =>
                        onTemplateChange({
                          ...template,
                          dpi: Number(e.target.value) || 300,
                          updatedAt: new Date().toISOString(),
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </FloatingPortal>
          )}
          <button
            type="button"
            onClick={onOpenPreview}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-2.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Podgląd
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || saveDisabled}
            title={saveDisabled ? "Popraw błędy walidacji przed zapisaniem" : undefined}
            className="inline-flex h-9 items-center rounded-lg bg-gradient-to-b from-cyan-500 to-cyan-600 px-4 text-[12px] font-semibold text-white shadow-md shadow-cyan-900/10 hover:from-cyan-400 hover:to-cyan-500 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {saving ? "Zapisywanie…" : "Zapisz szablon"}
          </button>
        </div>
      </div>
    </header>
  );
}
