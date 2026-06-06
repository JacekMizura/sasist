import type { OrderStatusOption } from "../../../../types/wmsPackingSettings";
import { orderPanelStatusGroupedSelectLabel } from "../../../../utils/orderPanelStatusUi";
import { selectClass } from "./settingsUi";

type Props = {
  value: number | null | undefined;
  options: OrderStatusOption[];
  onChange: (statusId: number | null) => void;
  emptyLabel?: string;
  disabled?: boolean;
};

export function OrderStatusIdSelect({
  value,
  options,
  onChange,
  emptyLabel = "— wybierz status —",
  disabled = false,
}: Props) {
  const resolved =
    value != null && options.some((o) => o.id === value) ? String(value) : value != null ? "" : "";

  return (
    <select
      className={selectClass}
      disabled={disabled || options.length === 0}
      value={resolved}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? null : Number(raw));
      }}
    >
      <option value="">{options.length === 0 ? "Brak skonfigurowanych statusów" : emptyLabel}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {orderPanelStatusGroupedSelectLabel(o)}
        </option>
      ))}
    </select>
  );
}
