import type { InventoryLineRead } from "@/api/inventoryCountApi";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import {
  inventoryDifferenceClassBadgeClass,
  inventoryDifferenceClassLabel,
  inventoryLineRowStatusLabel,
  inventoryLineStatusBadgeClass,
} from "../../inventoryCountUiLabels";

type LocationProps = {
  code: string;
  /** Typ lokalizacji WMS (PICK, BUFFER, …) — gdy brak, domyślnie PICK. */
  type?: string;
};

export function InventoryLocationBadge({ code, type = "PICK" }: LocationProps) {
  return <LocationBadge code={code} type={type} />;
}

export function InventoryLineStatusBadge({ line }: { line: InventoryLineRead }) {
  return (
    <span className={inventoryLineStatusBadgeClass(line.status, line.difference_quantity)}>
      {inventoryLineRowStatusLabel(line)}
    </span>
  );
}

export function InventoryVarianceClassBadge({ diffClass }: { diffClass?: string | null }) {
  const label = inventoryDifferenceClassLabel(diffClass);
  if (!label) return null;
  return <span className={inventoryDifferenceClassBadgeClass(diffClass)}>{label}</span>;
}

export function InventoryProductThumb({ url, name }: { url?: string | null; name?: string | null }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain" loading="lazy" />
      ) : (
        <span className="text-[10px] font-bold text-slate-300">—</span>
      )}
      <span className="sr-only">{name ?? "Produkt"}</span>
    </div>
  );
}
