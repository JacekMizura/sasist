import type { PanelWmsOperationalMarker } from "../orders/panelStatusWmsChips";
import { PANEL_TREE_WMS_ICON_COLUMN_CLASS } from "./panelStatusTreeStyles";

type Props = {
  markers: PanelWmsOperationalMarker[];
};

/** Stała szerokość lewej kolumny — ikony WMS przed paskiem statusu. */
export function PanelStatusWmsIconColumn({ markers }: Props) {
  return (
    <span className={PANEL_TREE_WMS_ICON_COLUMN_CLASS} aria-hidden={markers.length === 0}>
      {markers.map((m) => {
        const MIcon = m.Icon;
        return (
          <span key={m.id} title={m.title} className="inline-flex text-slate-400">
            <MIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </span>
        );
      })}
    </span>
  );
}
