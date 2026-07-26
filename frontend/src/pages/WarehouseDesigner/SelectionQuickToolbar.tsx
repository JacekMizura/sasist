/**
 * Floating quick actions for the active designer selection (Layout or Routing).
 * Complements inspectors — does not replace them. Same selection SSOT.
 */

import type { DesignerSelection } from "./designerSelection";
import type { PassageSource } from "../../types/warehouse";
import { normalizePassageSource, PassageSource as PassageSourceEnum } from "../../types/warehouse";
import { GhostButton, DangerButton, colors, radius, shadows } from "../../design-system";

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

const darkGhost =
  "!h-auto !rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-[10px] !font-semibold !text-cyan-100 hover:!bg-cyan-600 hover:!text-white";
const darkDanger =
  "!h-auto !rounded-none !border-0 !bg-transparent !px-2 !py-1.5 !text-[10px] !font-semibold !text-red-200 hover:!bg-red-600 hover:!text-white";

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
      className={`absolute z-[55] flex gap-0.5 overflow-hidden border border-cyan-500/50 ${radius.sm} ${colors.text.inverse} bg-slate-800 ${shadows.md}`}
      style={{ left: anchor.left, top: anchor.top, pointerEvents: "auto" }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {selection.kind === "node" && (
        <>
          {onEditRouting && (
            <GhostButton type="button" density="compact" className={darkGhost} onClick={onEditRouting} title="Przełącz tryb Edytuj">
              Edytuj
            </GhostButton>
          )}
          {onDelete && (
            <DangerButton type="button" density="compact" className={darkDanger} onClick={onDelete}>
              Usuń
            </DangerButton>
          )}
        </>
      )}
      {selection.kind === "edge" && (
        <>
          {onFlipEdgeDirection && (
            <GhostButton type="button" density="compact" className={darkGhost} onClick={onFlipEdgeDirection}>
              Odwróć
            </GhostButton>
          )}
          {onDelete && (
            <DangerButton type="button" density="compact" className={darkDanger} onClick={onDelete}>
              Usuń
            </DangerButton>
          )}
        </>
      )}
      {selection.kind === "passage" && (
        <>
          {inherited && onOpenTemplate ? (
            <GhostButton type="button" density="compact" className={darkGhost} onClick={onOpenTemplate}>
              Otwórz szablon
            </GhostButton>
          ) : (
            onDelete && (
              <DangerButton type="button" density="compact" className={darkDanger} onClick={onDelete}>
                Usuń
              </DangerButton>
            )
          )}
        </>
      )}
      {selection.kind === "rack" && (
        <>
          {onRackProperties && (
            <GhostButton type="button" density="compact" className={darkGhost} onClick={onRackProperties}>
              Właściwości
            </GhostButton>
          )}
          {onOpenTemplate && (
            <GhostButton type="button" density="compact" className={darkGhost} onClick={onOpenTemplate}>
              Otwórz szablon
            </GhostButton>
          )}
          {onDelete && (
            <DangerButton type="button" density="compact" className={darkDanger} onClick={onDelete}>
              Usuń
            </DangerButton>
          )}
        </>
      )}
    </div>
  );
}
