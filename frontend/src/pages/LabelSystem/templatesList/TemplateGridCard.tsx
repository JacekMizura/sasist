import { TemplatePreview } from "../../../components/labels/TemplatePreview";
import { formatLabelSizeMm } from "../../../utils/formatMm";
import { printModuleTypeLabel } from "../labelPrintModuleTypes";
import {
  formatEditedMeta,
  getCardPreviewSize,
  parseTemplateJson,
  type GroupRow,
  type TemplateWithMeta,
} from "./templatesListTypes";

type Props = {
  template: TemplateWithMeta;
  selected: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  deleting: boolean;
  groups: GroupRow[];
  moving: boolean;
  onMoveToGroup: (groupId: number | null) => void;
};

/** Grid card presentation for „Karty” view — same actions as list row. */
export default function TemplateGridCard({
  template: t,
  selected,
  onToggleSelect,
  onPreview,
  onEdit,
  onDuplicate,
  onDelete,
  deleting,
  groups,
  moving,
  onMoveToGroup,
}: Props) {
  const typeKey = (t.template_type || "location").toLowerCase();
  const pv = getCardPreviewSize(t.widthMm, t.heightMm);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleSelect();
        }
      }}
      className={[
        "flex w-full cursor-pointer flex-col overflow-hidden border bg-white shadow-sm transition",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected
          ? "border-orange-400 ring-2 ring-orange-300/60"
          : "border-[#E5E7EB] hover:border-gray-300",
      ].join(" ")}
      style={{ borderRadius: 16 }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
        className="border-b border-[#E5E7EB] bg-white p-3 text-left"
        aria-label={`Podgląd szablonu ${t.name}`}
      >
        <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-1">
          <TemplatePreview
            templateId={t.id}
            template={parseTemplateJson(t.template_json)}
            containerWidthPx={pv.width}
            containerHeightPx={pv.height}
          />
        </div>
      </button>

      <div className="flex flex-col gap-2.5 p-3.5">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Zaznacz szablon ${t.name}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-slate-900">{t.name}</p>
              {t.is_default ? (
                <span className="rounded-md bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800">
                  Domyślny
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {printModuleTypeLabel(typeKey)} • {formatLabelSizeMm(t.widthMm, t.heightMm)} •{" "}
              {formatEditedMeta(t.updated_at)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onPreview}
            className="rounded-xl border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:shadow-md"
          >
            Podgląd
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-xl border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:shadow-md"
          >
            Edytuj
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded-xl border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:shadow-md"
          >
            Duplikuj
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="rounded-xl border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "…" : "Usuń"}
          </button>
        </div>

        {groups.length > 0 ? (
          <div onClick={(e) => e.stopPropagation()}>
            <label className="mb-1 block text-[10px] text-slate-500">Przenieś do grupy</label>
            <select
              value={t.group_id ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                onMoveToGroup(v === "" ? null : Number(v));
              }}
              disabled={moving}
              className="w-full rounded-lg border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-slate-700"
            >
              <option value="">Bez grupy</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </div>
  );
}
