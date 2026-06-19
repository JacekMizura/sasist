import { panelTreeCountClass } from "./panelStatusTreeStyles";

type Props = {
  value: number | string;
  active?: boolean;
};

export function PanelTreeCount({ value, active }: Props) {
  return <span className={panelTreeCountClass(active)}>{value}</span>;
}
