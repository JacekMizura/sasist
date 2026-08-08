import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import type { PanelConfigurableUiStatusBrief } from "../../utils/panelListStatusBriefMappers";
import { MAIN_PANEL_GROUP_ORDER } from "../../utils/orderPanelMainGroupOrder";
import { ORDERS_PANEL_GROUP_LABELS } from "./OrdersPanelStatusSidebar";
import { OrderUiStatusBadge } from "./OrderUiStatusBadge";

export type OrderUiStatusSelectedItem = PanelConfigurableUiStatusBrief & { id?: number };

export type OrderUiStatusSelectedGroupsProps = {
  statuses: readonly OrderUiStatusSelectedItem[];
  removable?: boolean;
  /** Remove by status id when available; otherwise by index in the original `statuses` list. */
  onRemove?: (statusId: number | null, index: number) => void;
  onBadgeClick?: (statusId: number | null, index: number) => void;
  className?: string;
  /** Compact labels for dense surfaces (automation table cells). */
  compact?: boolean;
};

type GroupBucket = {
  mainGroup: OrderUiMainGroup;
  label: string;
  items: Array<{ status: OrderUiStatusSelectedItem; index: number }>;
};

/** Bucket selected statuses into NEW / IN_PROGRESS / DONE — empty groups omitted. */
export function groupOrderUiStatusesByMainGroup(
  statuses: readonly OrderUiStatusSelectedItem[],
): GroupBucket[] {
  const buckets = new Map<OrderUiMainGroup, GroupBucket>();
  for (const mg of MAIN_PANEL_GROUP_ORDER) {
    buckets.set(mg, {
      mainGroup: mg,
      label: ORDERS_PANEL_GROUP_LABELS[mg],
      items: [],
    });
  }

  statuses.forEach((status, index) => {
    const mg = (status.main_group ?? "DONE") as OrderUiMainGroup;
    const bucket = buckets.get(mg) ?? buckets.get("DONE")!;
    bucket.items.push({ status, index });
  });

  return MAIN_PANEL_GROUP_ORDER.map((mg) => buckets.get(mg)!).filter((b) => b.items.length > 0);
}

/**
 * Selected status chips grouped by NOWE / W TOKU / ZAKOŃCZONE.
 * Status names stay name-only; grouping is a separate UI layer.
 * Shared by {@link OrderUiStatusField} and automation condition summaries.
 */
export function OrderUiStatusSelectedGroups({
  statuses,
  removable = false,
  onRemove,
  onBadgeClick,
  className = "",
  compact = false,
}: OrderUiStatusSelectedGroupsProps) {
  const groups = groupOrderUiStatusesByMainGroup(statuses);
  if (groups.length === 0) return null;

  return (
    <div className={`min-w-0 space-y-2 ${className}`.trim()} data-order-ui-status-selected-groups>
      {groups.map((group) => (
        <div key={group.mainGroup} className="min-w-0">
          <p
            className={
              compact
                ? "mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500"
                : "mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-600"
            }
          >
            {group.label}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {group.items.map(({ status, index }) => {
              const id = typeof status.id === "number" ? status.id : null;
              return (
                <OrderUiStatusBadge
                  key={`${group.mainGroup}-${id ?? status.name}-${index}`}
                  status={status}
                  removable={removable}
                  onRemove={onRemove ? () => onRemove(id, index) : undefined}
                  onClick={onBadgeClick ? () => onBadgeClick(id, index) : undefined}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
