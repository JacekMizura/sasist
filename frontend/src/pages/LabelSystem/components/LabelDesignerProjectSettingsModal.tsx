import type { TemplateMeta } from "../LabelTemplateDesigner";
import { LabelDesignerToolbarSelect } from "./LabelDesignerToolbarSelect";

type Props = {
  open: boolean;
  onClose: () => void;
  templateMeta?: TemplateMeta;
  onTemplateMetaChange?: (meta: TemplateMeta) => void;
  groups: Array<{ id: number; name: string }>;
  autoSliceStrip: boolean;
  setAutoSliceStrip: (v: boolean) => void;
  groupedLocationVariables: boolean;
  setGroupedLocationVariables: (v: boolean) => void;
  isLocationTemplate: boolean;
};

export function LabelDesignerProjectSettingsModal({
  open,
  onClose,
  templateMeta,
  onTemplateMetaChange,
  groups,
  autoSliceStrip,
  setAutoSliceStrip,
  groupedLocationVariables,
  setGroupedLocationVariables,
  isLocationTemplate,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[8500] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="label-project-settings-title"
      >
        <h2 id="label-project-settings-title" className="text-lg font-semibold text-slate-900">
          Ustawienia projektu
        </h2>
        <p className="mt-1 text-sm text-slate-500">Opcje importu i organizacji szablonu.</p>
        <div className="mt-4 space-y-4">
          {onTemplateMetaChange ? (
            <div className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grupa szablonów</span>
              <div className="mt-1">
                <LabelDesignerToolbarSelect
                  ariaLabel="Grupa szablonów"
                  value={templateMeta?.group_id != null ? String(templateMeta.group_id) : ""}
                  minWidthClass="w-full"
                  options={[
                    { value: "", label: "Bez grupy" },
                    ...groups.map((g) => ({ value: String(g.id), label: g.name })),
                  ]}
                  onChange={(v) => onTemplateMetaChange({ group_id: v === "" ? null : Number(v) })}
                />
              </div>
            </div>
          ) : null}
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-300"
              checked={autoSliceStrip}
              onChange={(e) => setAutoSliceStrip(e.target.checked)}
            />
            <span>Automatycznie tnij pasek etykiet przy imporcie obrazu (PNG/JPG)</span>
          </label>
          {isLocationTemplate ? (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300"
                checked={groupedLocationVariables}
                onChange={(e) => setGroupedLocationVariables(e.target.checked)}
              />
              <span>Podgląd: etykieta zgrupowana (CSV, piętra 1–3)</span>
            </label>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
