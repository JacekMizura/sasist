import { Copy, Eye, Pencil, Trash2 } from "lucide-react";

import {
  OperationalActionButton,
  OperationalActionColumn,
} from "@/components/operational";
import { StatusBadge } from "@/design-system";
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
import {
  TEMPLATES_LIST_GRID_CARD_BASE_CLASS,
  TEMPLATES_LIST_GRID_CARD_BODY_CLASS,
  TEMPLATES_LIST_GRID_CARD_IDLE_CLASS,
  TEMPLATES_LIST_GRID_CARD_PREVIEW_BAND_CLASS,
  TEMPLATES_LIST_GRID_CARD_PREVIEW_WRAP_CLASS,
  TEMPLATES_LIST_GRID_CARD_RADIUS,
  TEMPLATES_LIST_GRID_CARD_SELECTED_CLASS,
} from "./templatesListLayout";

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
        TEMPLATES_LIST_GRID_CARD_BASE_CLASS,
        selected ? TEMPLATES_LIST_GRID_CARD_SELECTED_CLASS : TEMPLATES_LIST_GRID_CARD_IDLE_CLASS,
      ].join(" ")}
      style={{ borderRadius: TEMPLATES_LIST_GRID_CARD_RADIUS }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
        className={TEMPLATES_LIST_GRID_CARD_PREVIEW_WRAP_CLASS}
        aria-label={`Podgląd szablonu ${t.name}`}
      >
        <div className={TEMPLATES_LIST_GRID_CARD_PREVIEW_BAND_CLASS}>
          <TemplatePreview
            templateId={t.id}
            template={parseTemplateJson(t.template_json)}
            containerWidthPx={pv.width}
            containerHeightPx={pv.height}
          />
        </div>
      </button>

      <div className={TEMPLATES_LIST_GRID_CARD_BODY_CLASS}>
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
                <StatusBadge tone="info" density="compact">
                  Domyślny
                </StatusBadge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {printModuleTypeLabel(typeKey)} • {formatLabelSizeMm(t.widthMm, t.heightMm)} •{" "}
              {formatEditedMeta(t.updated_at)}
            </p>
          </div>
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <OperationalActionColumn
            aria-label={`Akcje szablonu ${t.name}`}
            slots={[
              <OperationalActionButton
                key="preview"
                title="Podgląd"
                aria-label={`Podgląd ${t.name}`}
                onClick={onPreview}
              >
                <Eye strokeWidth={2} aria-hidden />
              </OperationalActionButton>,
              <OperationalActionButton
                key="edit"
                title="Edytuj"
                aria-label={`Edytuj ${t.name}`}
                onClick={onEdit}
              >
                <Pencil strokeWidth={2} aria-hidden />
              </OperationalActionButton>,
              <OperationalActionButton
                key="duplicate"
                title="Duplikuj"
                aria-label={`Duplikuj ${t.name}`}
                onClick={onDuplicate}
              >
                <Copy strokeWidth={2} aria-hidden />
              </OperationalActionButton>,
              <OperationalActionButton
                key="delete"
                variant="danger"
                disabled={deleting}
                title="Usuń"
                aria-label={`Usuń ${t.name}`}
                onClick={onDelete}
              >
                <Trash2 strokeWidth={2} aria-hidden />
              </OperationalActionButton>,
            ]}
          />
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
