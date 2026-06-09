import type { InventoryLineRead } from "@/api/inventoryCountApi";
import { CarrierBadge } from "@/components/warehouse/carriers/CarrierBadge";
import { firstProductImageUrl } from "@/components/panelList/ProductListItem";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import { Image as ImageIcon } from "lucide-react";
import {
  inventoryDifferenceClassBadgeClass,
  inventoryDifferenceClassLabel,
  inventoryLineRowStatusLabel,
  inventoryLineStatusBadgeClass,
} from "../../inventoryCountUiLabels";

type LocationProps = {
  code: string;
  type?: string;
};

export function InventoryLocationBadge({ code, type = "PICK" }: LocationProps) {
  return <LocationBadge code={code} type={type} />;
}

/** Location + optional carrier stacked — warehouse-native layout. */
export function InventoryLocationStack({
  locationCode,
  carrierCode,
}: {
  locationCode: string;
  carrierCode?: string | null;
}) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <InventoryLocationBadge code={locationCode} />
      {carrierCode?.trim() ? <CarrierBadge code={carrierCode.trim()} /> : null}
    </div>
  );
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

export function InventoryConflictStatusBadge({ status }: { status?: string | null }) {
  const key = String(status ?? "conflict_open").toLowerCase();
  const label =
    key === "conflict_resolved_manual" || key === "resolved"
      ? "Rozwiązany ręcznie"
      : key === "recount_requested" || key === "required"
        ? "Oczekuje ponownego liczenia"
        : key === "recount_completed"
          ? "Ponownie przeliczone"
          : "Konflikt otwarty";
  const cls =
    key === "conflict_resolved_manual" || key === "resolved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : key === "recount_requested" || key === "required"
        ? "border-sky-200 bg-sky-50 text-sky-900"
        : key === "recount_completed"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

/** 56×56 conflict panel thumbnail — rounded, object-cover. */
export function InventoryConflictProductMini({ url, name }: { url?: string | null; name?: string | null }) {
  const src = firstProductImageUrl(url ?? null);
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <ImageIcon className="h-6 w-6 text-slate-300" strokeWidth={1.5} aria-hidden />
      )}
      <span className="sr-only">{name ?? "Produkt"}</span>
    </div>
  );
}

export function InventoryVarianceClassBadge({ diffClass }: { diffClass?: string | null }) {
  const label = inventoryDifferenceClassLabel(diffClass);
  if (!label) return null;
  return (
    <span className={`${inventoryDifferenceClassBadgeClass(diffClass)} !px-2.5 !py-1 !text-xs`}>{label}</span>
  );
}

/** Larger product photo — no card frame, warehouse readability. */
export function InventoryProductThumb({ url, name }: { url?: string | null; name?: string | null }) {
  const src = firstProductImageUrl(url ?? null);
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center sm:h-24 sm:w-24">
      {src ? (
        <img src={src} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" loading="lazy" />
      ) : (
        <ImageIcon className="h-10 w-10 text-slate-200" strokeWidth={1.5} aria-hidden />
      )}
      <span className="sr-only">{name ?? "Produkt"}</span>
    </div>
  );
}

/** @deprecated stock source column removed — use InventoryLocationStack for carrier */
export function InventoryStockSourceBadge(_props: { line: InventoryLineRead }) {
  return null;
}

/** @deprecated carrier shown under location, not on product */
export function InventoryCarrierBadge({ code }: { code: string }) {
  return <CarrierBadge code={code} />;
}
