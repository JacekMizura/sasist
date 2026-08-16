import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import type { ProductionTerminalDisplaySettings } from "@/api/wmsProductionSettingsApi";
import { WMS_TASK_CARD } from "@/components/wms/execution/wmsLayoutTokens";
import {
  EXECUTION_STATUS_LABEL,
  PRODUCTION_KIND_LABEL,
  type ProductionExecutionKind,
} from "@/modules/production/productionExecutionTypes";
import { operationalBadgeBase, operationalBadgeNeutralClass } from "@/components/operational/operationalSemanticBadges";
import { WmsProductionProductIdentity } from "../display/WmsProductionProductIdentity";
import { formatTerminalQuantity } from "../display/productionTerminalDisplay";

type Accent = "amber" | "blue" | "emerald";

const ACCENT_STRIP: Record<Accent, string> = {
  amber: "bg-amber-400",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
};

type Props = {
  kind: ProductionExecutionKind;
  number: string;
  display: ProductionTerminalDisplaySettings;
  productName?: string | null;
  productSku?: string | null;
  productEan?: string | null;
  productCatalogNumber?: string | null;
  productBarcode?: string | null;
  productImageUrl?: string | null;
  productUnit?: string | null;
  quantity?: number | string;
  status?: string;
  statusBadge?: ReactNode;
  accent?: Accent;
  disabled?: boolean;
  disabledTitle?: string;
  onClick: () => void;
};

export function WmsProductionJobQueueCard({
  kind,
  number,
  display,
  productName,
  productSku,
  productEan,
  productCatalogNumber,
  productBarcode,
  productImageUrl,
  productUnit,
  quantity,
  status,
  statusBadge,
  accent = "amber",
  disabled = false,
  disabledTitle,
  onClick,
}: Props) {
  const kindLabel = PRODUCTION_KIND_LABEL[kind];
  const statusLabel = status ? EXECUTION_STATUS_LABEL[status] ?? status : null;
  const qtyNode =
    quantity == null
      ? null
      : typeof quantity === "number"
        ? formatTerminalQuantity(quantity, { unit: productUnit, showUnit: display.show_unit })
        : quantity;

  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      onClick={onClick}
      className={`${WMS_TASK_CARD} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <div className={`absolute bottom-0 left-0 top-0 w-1 ${ACCENT_STRIP[accent]}`} aria-hidden />
      <div className="flex flex-1 flex-col gap-3 pl-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${operationalBadgeBase} ${operationalBadgeNeutralClass} text-xs uppercase tracking-wide`}>
                {kindLabel}
              </span>
              {statusLabel ? (
                <span className={`${operationalBadgeBase} ${operationalBadgeNeutralClass} text-xs`}>{statusLabel}</span>
              ) : null}
            </div>
            <p className="mt-2 font-mono text-2xl font-black tracking-tight text-slate-900">{number}</p>
          </div>
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-slate-500" aria-hidden />
        </div>

        <WmsProductionProductIdentity
          display={display}
          product={{
            name: productName,
            sku: productSku,
            ean: productEan,
            catalogNumber: productCatalogNumber,
            barcode: productBarcode,
            imageUrl: productImageUrl,
            unit: productUnit,
          }}
          thumbSize="lg"
          nameClassName="text-base font-semibold leading-snug text-slate-800"
        >
          {qtyNode != null ? (
            <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">{qtyNode}</p>
          ) : null}
        </WmsProductionProductIdentity>

        {statusBadge ? <div className="mt-auto pt-1">{statusBadge}</div> : null}
      </div>
    </button>
  );
}

/** @deprecated Use WmsProductionJobQueueCard */
export { WmsProductionJobQueueCard as WmsProductionBatchQueueCard };
