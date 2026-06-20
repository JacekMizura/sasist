import { panelTreeCountClass } from "./panelStatusTreeStyles";
import { isValidPanelStatusHex } from "../../utils/panelStatusColor";

type Props = {
  value: number | string;
  active?: boolean;
  /** Opcjonalny kolor licznika — bez wartości zachowuje neutralny szary. */
  colorHex?: string | null;
};

export function PanelTreeCount({ value, active, colorHex }: Props) {
  const colored = colorHex && isValidPanelStatusHex(colorHex);
  return (
    <span
      className={panelTreeCountClass(active)}
      style={colored ? { color: colorHex!.trim() } : undefined}
    >
      {value}
    </span>
  );
}
