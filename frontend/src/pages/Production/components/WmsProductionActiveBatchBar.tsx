import { WMS_TERMINAL_LABEL } from "@/components/wms/execution/wmsLayoutTokens";
import type { ProductionTerminalDisplaySettings } from "@/api/wmsProductionSettingsApi";
import {
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
  kind?: ProductionExecutionKind;
  label: string;
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
  accent?: Accent;
};

/** Active job context bar — batch or MO. */
export function WmsProductionActiveBatchBar({
  kind,
  label,
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
  accent = "amber",
}: Props) {
  const qtyNode =
    quantity == null
      ? null
      : typeof quantity === "number"
        ? formatTerminalQuantity(quantity, { unit: productUnit, showUnit: display.show_unit })
        : quantity;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`absolute bottom-0 left-0 top-0 w-1 ${ACCENT_STRIP[accent]}`} aria-hidden />
      <div className="space-y-3 pl-3">
        {kind ? (
          <span className={`${operationalBadgeBase} ${operationalBadgeNeutralClass} inline-flex text-xs uppercase tracking-wide`}>
            {PRODUCTION_KIND_LABEL[kind]}
          </span>
        ) : null}
        <p className={WMS_TERMINAL_LABEL}>{label}</p>
        <p className="font-mono text-2xl font-black text-slate-900">{number}</p>
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
          nameClassName="text-base font-semibold text-slate-800"
        >
          {qtyNode != null ? (
            <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">{qtyNode}</p>
          ) : null}
        </WmsProductionProductIdentity>
      </div>
    </div>
  );
}
