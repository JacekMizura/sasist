import type { OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { ORDERS_PANEL_GROUP_LABELS } from "./OrdersPanelStatusSidebar";

type Props = {
  id?: string;
  value: string;
  disabled?: boolean;
  panelSummary: OrderUiStatusPanelSummary | null;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLSelectElement>) => void;
  emptyLabel?: string;
};

/** Same styling as the order list row panel status dropdown. */
export function OrderPanelStatusSelect({
  id,
  value,
  disabled,
  panelSummary,
  onChange,
  onClick,
  emptyLabel = "— panel —",
}: Props) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onClick={onClick}
      onChange={onChange}
      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 disabled:opacity-60"
    >
      <option value="">{emptyLabel}</option>
      {(panelSummary?.groups ?? []).flatMap((block) =>
        block.sub_statuses.map((s) => (
          <option key={s.id} value={String(s.id)}>
            {ORDERS_PANEL_GROUP_LABELS[block.main_group]}: {s.name}
          </option>
        )),
      )}
    </select>
  );
}
