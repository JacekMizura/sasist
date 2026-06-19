import { PanelStatusWmsIconColumn } from "./PanelStatusWmsIconColumn";
import {
  PANEL_TREE_COUNT_CLASS,
  panelTreeStatusBarClass,
  panelTreeStatusRowClass,
} from "./panelStatusTreeStyles";

type Props = {
  active: boolean;
  label: string;
  count: number | string | null | undefined;
  onClick: () => void;
  title?: string;
  /** Kolor paska — domyślnie neutralny slate. */
  barColor?: string;
};

/** Wiersz filtra operacyjnego — ten sam język co wiersz statusu panelu. */
export function PanelSidebarOperationalRow({
  active,
  label,
  count,
  onClick,
  title,
  barColor = "#cbd5e1",
}: Props) {
  return (
    <button
      type="button"
      className={panelTreeStatusRowClass(active)}
      title={title ?? label}
      onClick={onClick}
    >
      <PanelStatusWmsIconColumn markers={[]} />
      <span className={panelTreeStatusBarClass(active)} style={{ backgroundColor: barColor }} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={`${PANEL_TREE_COUNT_CLASS} ${active ? "text-slate-700" : ""}`}>{count ?? "—"}</span>
    </button>
  );
}
