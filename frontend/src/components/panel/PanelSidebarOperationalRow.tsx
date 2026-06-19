import { PanelTreeCount } from "./PanelTreeCount";
import { panelTreeOperationalRowClass } from "./panelStatusTreeStyles";

type Props = {
  active: boolean;
  label: string;
  count: number | string | null | undefined;
  onClick: () => void;
  title?: string;
};

/** Wiersz filtra operacyjnego (zwroty) — bez pasków, ikon, kart, badge. */
export function PanelSidebarOperationalRow({ active, label, count, onClick, title }: Props) {
  return (
    <button
      type="button"
      className={panelTreeOperationalRowClass(active)}
      title={title ?? label}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
      <PanelTreeCount value={count ?? "—"} active={active} />
    </button>
  );
}
