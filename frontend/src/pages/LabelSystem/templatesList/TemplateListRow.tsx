import { Eye } from "lucide-react";

import { TemplatePreview } from "../../../components/labels/TemplatePreview";
import { formatLabelSizeMm } from "../../../utils/formatMm";
import { printModuleTypeLabel } from "../labelPrintModuleTypes";
import {
  formatEditedMeta,
  getListRowPreviewSize,
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

/**
 * Full-width template row card — primary list presentation.
 */
export default function TemplateListRow({
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
  const listPv = getListRowPreviewSize(t.widthMm, t.heightMm);
  const typeKey = (t.template_type || "location").toLowerCase();

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
        "group flex w-full cursor-pointer items-center gap-4 border bg-white px-4 py-3.5 shadow-sm transition",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected
          ? "border-orange-400 ring-2 ring-orange-300/60"
          : "border-[#E5E7EB] hover:border-gray-300",
      ].join(" ")}
      style={{ borderRadius: 16 }}
    >
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 rounded border-gray-300"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Zaznacz szablon ${t.name}`}
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-1.5 transition hover:border-orange-300"
        style={{ width: listPv.boxW, height: listPv.boxH }}
        aria-label={`Podgląd szablonu ${t.name}`}
      >
        <TemplatePreview
          templateId={t.id}
          template={parseTemplateJson(t.template_json)}
          containerWidthPx={listPv.cw}
          containerHeightPx={listPv.ch}
        />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-900">{t.name}</h3>
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
        {groups.length > 0 ? (
          <div className="mt-2 max-w-xs" onClick={(e) => e.stopPropagation()}>
            <select
              value={t.group_id ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                onMoveToGroup(v === "" ? null : Number(v));
              }}
              disabled={moving}
              className="w-full rounded-lg border border-[#E5E7EB] bg-white px-2 py-1 text-xs text-slate-700"
              aria-label="Przenieś do grupy"
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

      <div
        className="flex shrink-0 flex-wrap items-center justify-end gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onPreview}
          className="inline-flex items-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:shadow-md"
        >
          <Eye className="h-3.5 w-3.5 text-slate-500" strokeWidth={2} aria-hidden />
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
    </div>
  );
}
