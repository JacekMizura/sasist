import type { InventoryLineRead } from "@/api/inventoryCountApi";
import { ProductThumb } from "@/components/orders/panelList/ProductThumb";
import { firstProductImageUrl } from "@/components/panelList/ProductListItem";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import { Package } from "lucide-react";
import {
  inventoryDifferenceClassBadgeClass,
  inventoryDifferenceClassLabel,
  inventoryLineRowStatusLabel,
  inventoryLineStatusBadgeClass,
} from "../../inventoryCountUiLabels";
import { inventoryStockSourceLabel } from "../../inventoryStockSourceLabel";

type LocationProps = {
  code: string;
  type?: string;
};

export function InventoryLocationBadge({ code, type = "PICK" }: LocationProps) {
  return <LocationBadge code={code} type={type} />;
}

export function InventoryLineStatusBadge({ line }: { line: InventoryLineRead }) {
  return (
    <span
      className={`${inventoryLineStatusBadgeClass(line.status, line.difference_quantity, line.recount_state)} !px-2.5 !py-1 !text-xs`}
    >
      {inventoryLineRowStatusLabel(line)}
    </span>
  );
}

export function InventoryVarianceClassBadge({ diffClass }: { diffClass?: string | null }) {
  const label = inventoryDifferenceClassLabel(diffClass);
  if (!label) return null;
  return (
    <span className={`${inventoryDifferenceClassBadgeClass(diffClass)} !px-2.5 !py-1 !text-xs`}>{label}</span>
  );
}

/** Product photo — same footprint as Products list (`ProductThumb` default). */
export function InventoryProductThumb({ url, name }: { url?: string | null; name?: string | null }) {
  return (
    <div className="shrink-0">
      <ProductThumb url={firstProductImageUrl(url ?? null)} />
      <span className="sr-only">{name ?? "Produkt"}</span>
    </div>
  );
}

export function InventoryCarrierBadge({ code }: { code: string }) {
  return (
    <span
      title={`Nośnik ${code}`}
      className="inline-flex max-w-full items-center gap-1 rounded border border-violet-200/90 bg-violet-50/80 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-violet-900"
    >
      <Package className="h-2.5 w-2.5 shrink-0 opacity-80" aria-hidden />
      Nośnik {code}
    </span>
  );
}

export function InventoryStockSourceBadge({ line }: { line: InventoryLineRead }) {
  const src = inventoryStockSourceLabel(line);
  const isCarrier = src.label === "W nośniku";
  return (
    <div className="flex min-w-[7.5rem] flex-col gap-1">
      <span
        title={src.detail}
        className={`inline-flex w-fit max-w-full items-center rounded border px-2 py-1 text-xs font-semibold leading-snug ${
          isCarrier
            ? "border-sky-200/90 bg-sky-50/80 text-sky-900"
            : "border-emerald-200/90 bg-emerald-50/80 text-emerald-900"
        }`}
      >
        {src.label}
      </span>
      <span className="text-xs leading-snug text-slate-500">{src.detail}</span>
    </div>
  );
}
