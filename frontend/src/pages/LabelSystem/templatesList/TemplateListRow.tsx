import { Eye } from "lucide-react";
import type { ReactNode } from "react";

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
  onEdit: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  showPreview?: boolean;
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
  onEdit,
  onDuplicate,
  onDelete,
  deleting = false,
  showPreview = true,
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
            <span className="rounded-md bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800">
              Domyślny
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-slate-500">{metaLine}</p>
        {belowMeta ? (
          <div className="mt-2 max-w-xs" onClick={(e) => e.stopPropagation()}>
            {belowMeta}
          </div>
        ) : null}
      </div>

      <div
        className="flex shrink-0 flex-wrap items-center justify-end gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        {showPreview && onPreview ? (
          <button
            type="button"
            onClick={onPreview}
            className="inline-flex items-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:shadow-md"
          >
            <Eye className="h-3.5 w-3.5 text-slate-500" strokeWidth={2} aria-hidden />
            Podgląd
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEdit}
          className="rounded-xl border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:shadow-md"
        >
          Edytuj
        </button>
        {showDuplicate && onDuplicate ? (
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded-xl border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:shadow-md"
          >
            Duplikuj
          </button>
        ) : null}
        {showDelete && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="rounded-xl border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "…" : "Usuń"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
