/**
 * Floating quick actions for the active designer selection (Layout or Routing).
 * Complements inspectors — does not replace them. Same selection SSOT.
 */

import type { DesignerSelection } from "./designerSelection";
import type { PassageSource } from "../../types/warehouse";
import { normalizePassageSource, PassageSource as PassageSourceEnum } from "../../types/warehouse";

type Props = {
  selection: DesignerSelection;
  workspace: "designing" | "routes";
  /** Screen position (px) of toolbar anchor — top-left of chip bar. */
  anchor: { left: number; top: number } | null;
  passageSource?: PassageSource | null;
  onEditRouting?: () => void;
  onDelete?: () => void;
  onOpenTemplate?: () => void;
  onFlipEdgeDirection?: () => void;
  onRackProperties?: () => void;
};

export function SelectionQuickToolbar({
  selection,
  workspace,
  anchor,
  passageSource,
  onEditRouting,
  onDelete,
  onOpenTemplate,
  onFlipEdgeDirection,
  onRackProperties,
}: Props) {
  if (!anchor || selection.kind === null) return null;
  if (workspace === "routes" && selection.kind !== "node" && selection.kind !== "edge") return null;
  if (workspace === "designing" && selection.kind !== "rack" && selection.kind !== "passage") return null;

  const inherited =
    selection.kind === "passage" &&
    normalizePassageSource(passageSource) === PassageSourceEnum.INHERITED;

  return (
    <div
      className="absolute z-[55] flex gap-0.5 overflow-hidden rounded border border-cyan-500/50 bg-slate-800 shadow-lg"
      style={{ left: anchor.left, top: anchor.top, pointerEvents: "auto" }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {selection.kind === "node" && (
        <>
          {onEditRouting && (
            <button
              type="button"
              className="px-2 py-1.5 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-600"
              onClick={onEditRouting}
              title="Przełącz tryb Edytuj"
            >
              Edytuj
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="px-2 py-1.5 text-[10px] font-semibold text-red-200 hover:bg-red-600"
              onClick={onDelete}
            >
              Usuń
            </button>
          )}
        </>
      )}
      {selection.kind === "edge" && (
        <>
          {onFlipEdgeDirection && (
            <button
              type="button"
              className="px-2 py-1.5 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-600"
              onClick={onFlipEdgeDirection}
            >
              Odwróć
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="px-2 py-1.5 text-[10px] font-semibold text-red-200 hover:bg-red-600"
              onClick={onDelete}
            >
              Usuń
            </button>
          )}
        </>
      )}
      {selection.kind === "passage" && (
        <>
          {inherited && onOpenTemplate ? (
            <button
              type="button"
              className="px-2 py-1.5 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-600"
              onClick={onOpenTemplate}
            >
              Otwórz szablon
            </button>
          ) : (
            onDelete && (
              <button
                type="button"
                className="px-2 py-1.5 text-[10px] font-semibold text-red-200 hover:bg-red-600"
                onClick={onDelete}
              >
                Usuń
              </button>
            )
          )}
        </>
      )}
      {selection.kind === "rack" && (
        <>
          {onRackProperties && (
            <button
              type="button"
              className="px-2 py-1.5 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-600"
              onClick={onRackProperties}
            >
              Właściwości
            </button>
          )}
          {onOpenTemplate && (
            <button
              type="button"
              className="px-2 py-1.5 text-[10px] font-semibold text-cyan-100 hover:bg-cyan-600"
              onClick={onOpenTemplate}
            >
              Otwórz szablon
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="px-2 py-1.5 text-[10px] font-semibold text-red-200 hover:bg-red-600"
              onClick={onDelete}
            >
              Usuń
            </button>
          )}
        </>
      )}
    </div>
  );
}
