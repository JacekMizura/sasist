import { Copy, Eye, Link2, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import {
  OperationalActionButton,
  OperationalActionColumn,
} from "@/components/operational";
import { StatusBadge } from "@/design-system";

type Props = {
  name: string;
  metaLine: ReactNode;
  /** Left preview / icon band — identical chrome for labels and documents. */
  thumbnail: ReactNode;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  selected?: boolean;
  onToggleSelect?: () => void;
  showCheckbox?: boolean;
  isDefault?: boolean;
  /** Optional slot under meta (e.g. group select for labels). */
  belowMeta?: ReactNode;
  onPreview?: () => void;
  /** Separate from Podgląd — e.g. document template assignments. */
  onUsages?: () => void;
  onEdit: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  showPreview?: boolean;
  showUsages?: boolean;
  usagesLabel?: string;
  showDuplicate?: boolean;
  showDelete?: boolean;
};

/**
 * Full-width template row card — primary list presentation.
 * Shared by Szablony etykiet and Szablony wydruków.
 */
export default function TemplateListRow({
  name,
  metaLine,
  thumbnail,
  thumbnailWidth = 112,
  thumbnailHeight = 72,
  selected = false,
  onToggleSelect,
  showCheckbox = false,
  isDefault = false,
  belowMeta,
  onPreview,
  onUsages,
  onEdit,
  onDuplicate,
  onDelete,
  deleting = false,
  showPreview = true,
  showUsages = false,
  usagesLabel = "Użycia",
  showDuplicate = true,
  showDelete = true,
}: Props) {
  const activate = () => {
    if (onToggleSelect) onToggleSelect();
    else onEdit();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
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
      {showCheckbox && onToggleSelect ? (
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 rounded border-gray-300"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Zaznacz szablon ${name}`}
        />
      ) : null}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onPreview) onPreview();
          else onEdit();
        }}
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-1.5 transition hover:border-orange-300"
        style={{ width: thumbnailWidth, height: thumbnailHeight }}
        aria-label={`Podgląd szablonu ${name}`}
      >
        {thumbnail}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-900">{name}</h3>
          {isDefault ? (
            <StatusBadge tone="info" density="compact">
              Domyślny
            </StatusBadge>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-slate-500">{metaLine}</p>
        {belowMeta ? (
          <div className="mt-2 max-w-xs" onClick={(e) => e.stopPropagation()}>
            {belowMeta}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-start justify-end" onClick={(e) => e.stopPropagation()}>
        <OperationalActionColumn
          aria-label={`Akcje szablonu ${name}`}
          slots={[
            showPreview && onPreview ? (
              <OperationalActionButton
                key="preview"
                title="Podgląd"
                aria-label={`Podgląd ${name}`}
                onClick={onPreview}
              >
                <Eye strokeWidth={2} aria-hidden />
              </OperationalActionButton>
            ) : null,
            showUsages && onUsages ? (
              <OperationalActionButton
                key="usages"
                title={usagesLabel}
                aria-label={`${usagesLabel} — ${name}`}
                onClick={onUsages}
              >
                <Link2 strokeWidth={2} aria-hidden />
              </OperationalActionButton>
            ) : null,
            <OperationalActionButton
              key="edit"
              title="Edytuj"
              aria-label={`Edytuj ${name}`}
              onClick={onEdit}
            >
              <Pencil strokeWidth={2} aria-hidden />
            </OperationalActionButton>,
            showDuplicate && onDuplicate ? (
              <OperationalActionButton
                key="duplicate"
                title="Duplikuj"
                aria-label={`Duplikuj ${name}`}
                onClick={onDuplicate}
              >
                <Copy strokeWidth={2} aria-hidden />
              </OperationalActionButton>
            ) : null,
            showDelete && onDelete ? (
              <OperationalActionButton
                key="delete"
                variant="danger"
                disabled={deleting}
                title="Usuń"
                aria-label={`Usuń ${name}`}
                onClick={onDelete}
              >
                <Trash2 strokeWidth={2} aria-hidden />
              </OperationalActionButton>
            ) : null,
          ]}
        />
      </div>
    </div>
  );
}
