import { panelTreeCountClass, PANEL_TREE_COUNT_BASE_CLASS } from "./panelStatusTreeStyles";
import { isValidPanelStatusHex } from "../../utils/panelStatusColor";

type Props = {
  value: number | string;
  active?: boolean;
  /** Opcjonalny kolor licznika — bez wartości zachowuje neutralny szary. */
  colorHex?: string | null;
};

export function PanelTreeCount({ value, active, colorHex }: Props) {
  const hex = colorHex?.trim();
  const colored = hex && isValidPanelStatusHex(hex);
  return (
    <span
      className={colored ? PANEL_TREE_COUNT_BASE_CLASS : panelTreeCountClass(active)}
      style={colored ? { color: hex.toLowerCase() } : undefined}
    >
      {value}
    </span>
  );
}
