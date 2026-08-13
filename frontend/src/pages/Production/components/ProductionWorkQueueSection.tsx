import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

import { AppEmptyState } from "@/components/app-shell";
import { EmptyState } from "@/design-system";
import { erpProductionPaths } from "../productionPaths";
import type { ProductionOperationalState } from "../productionOperationalState";
import { ProductionOperatorTaskCard } from "./ProductionOperatorTaskCard";

export type ProductionWorkItem = {
  key: string;
  kind: "batch" | "order";
  id: number;
  number: string;
  productLabel: string;
  productImageUrl?: string | null;
  qtyLabel: string;
  sourceLabel?: string | null;
  plannedDate?: string | null;
  priorityLabel?: string | null;
  state: ProductionOperationalState;
};

type Props = {
  items: ProductionWorkItem[];
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Compact one-line empty (dashboard empty sections). */
  compactEmpty?: boolean;
  limit?: number;
  seeAllTo?: string;
  seeAllLabel?: string;
};

function itemHref(item: ProductionWorkItem): string {
  const action = item.state.primaryAction;
  if (action.href) return action.href;
  return item.kind === "order" ? erpProductionPaths.order(item.id) : erpProductionPaths.batch(item.id);
}

function formatPlannedDate(raw?: string | null): string | null {
  if (!raw) return null;
  const d = raw.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return null;
  return `Termin ${day}.${m}.${y}`;
}

/** Exclusive work-queue rows — operator task cards. */
export function ProductionWorkQueueSection({
  items,
  emptyIcon,
  emptyTitle = "Brak pozycji",
  emptyDescription,
  compactEmpty = false,
  limit = 8,
  seeAllTo,
  seeAllLabel = "Pokaż wszystkie",
}: Props) {
  if (items.length === 0) {
    if (compactEmpty) {
      return <p className="py-1 text-sm text-slate-500">{emptyTitle}</p>;
    }
    if (emptyIcon) {
      return (
        <AppEmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          density="inline"
        />
      );
    }
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const visible = items.slice(0, limit);

  return (
    <div className="flex w-full flex-col gap-2">
      <ul className="flex w-full flex-col gap-2">
        {visible.map((item) => {
          const href = itemHref(item);
          const schedule = [formatPlannedDate(item.plannedDate), item.priorityLabel]
            .filter(Boolean)
            .join(" · ");
          const secondary = [item.number, item.sourceLabel].filter(Boolean).join(" · ");
          return (
            <li key={item.key} className="w-full">
              <ProductionOperatorTaskCard
                state={item.state}
                productLabel={item.productLabel}
                productImageUrl={item.productImageUrl}
                qtyLabel={item.qtyLabel}
                secondaryMeta={secondary}
                scheduleMeta={schedule || null}
                showThumb={item.kind === "order"}
                ctaHref={href}
                ctaOpenInNewTab={item.state.primaryAction.openInNewTab}
                ctaDisabled={item.state.primaryAction.disabled}
                ctaTitle={item.state.primaryAction.disabledReason}
              />
            </li>
          );
        })}
      </ul>
      {seeAllTo && items.length > 0 ? (
        <div className="pt-1 text-right">
          <Link to={seeAllTo} className="text-sm font-semibold text-slate-600 hover:text-slate-900">
            {seeAllLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
