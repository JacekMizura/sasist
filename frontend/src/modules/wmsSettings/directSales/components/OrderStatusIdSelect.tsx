import { OrderUiStatusField } from "../../../../components/orders/OrderUiStatusField";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../../types/orderUiStatus";

type Props = {
  value: number | null | undefined;
  onChange: (statusId: number | null) => void;
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
  emptyLabel?: string;
  disabled?: boolean;
  placeholder?: string;
};

/** Shared status field for Direct Sales settings (same picker as packing / automations). */
export function OrderStatusIdSelect({
  value,
  onChange,
  panelSummary,
  panelSubgroups,
  emptyLabel = "— brak —",
  disabled = false,
  placeholder = "Wybierz status…",
}: Props) {
  const hasStatuses =
    panelSummary != null && panelSummary.groups.some((g) => (g.sub_statuses?.length ?? 0) > 0);

  if (!hasStatuses) {
    return <p className="text-sm text-slate-500">Brak skonfigurowanych statusów panelu.</p>;
  }

  return (
    <OrderUiStatusField
      panelSummary={panelSummary}
      panelSubgroups={panelSubgroups}
      selectedStatusId={value ?? null}
      allowClear
      clearLabel={emptyLabel}
      placeholder={placeholder}
      disabled={disabled}
      onPick={(id) => onChange(id)}
    />
  );
}
