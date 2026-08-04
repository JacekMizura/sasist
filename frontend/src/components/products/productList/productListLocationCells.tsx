import { useCallback, useEffect, useRef, useState } from "react";

import { LocationTypeBadge } from "../../warehouse/LocationTypeBadge";
import { fallbackBadgeFromDisposition } from "../MagazynInventoryLine";
import type { ProductListRow } from "../../../types/productListRow";

type Product = ProductListRow;

const MAX_LOCATION_BADGES = 3;

export type PhysicalInvLoc = {
  name: string;
  quantity: number;
  warehouse_id?: number;
  storage_type?: string;
  location_uuid?: string | null;
};

export type OpenLocationOnMapPayload = { product: Product; warehouseId: number; focusedUuid: string };

export function physicalInventoryLocations(p: Product): PhysicalInvLoc[] {
  const inv = p.inventory;
  if (Array.isArray(inv) && inv.length > 0) {
    return inv
      .filter((row) => (Number(row.quantity) || 0) > 0)
      .map((row) => {
        const code = (row.location_code ?? "").trim() || "";
        const bd =
          (row.disposition_badge ?? "").trim() ||
          fallbackBadgeFromDisposition(String(row.stock_disposition ?? "").trim()) ||
          "";
        const name = bd ? `${code} ${bd}`.trim() : code;
        return {
          name,
          quantity: Number(row.quantity) || 0,
          warehouse_id: row.warehouse_id,
          storage_type: row.location_type,
          location_uuid: row.location_uuid ?? null,
        };
      });
  }
  return (p.locations ?? [])
    .filter((l) => (l.quantity ?? 0) > 0)
    .map((l) => ({
      name: (l.name ?? "").trim() || "",
      quantity: Number(l.quantity) || 0,
      warehouse_id: l.warehouse_id,
      storage_type: l.storage_type,
      location_uuid: l.location_uuid ?? null,
    }));
}

function LocationOverflowPopover({ hidden }: { hidden: PhysicalInvLoc[] }) {
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHide = useCallback(() => {
    if (hideTimer.current != null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearHide();
    setOpen(true);
  }, [clearHide]);

  const scheduleHide = useCallback(() => {
    clearHide();
    hideTimer.current = setTimeout(() => setOpen(false), 120);
  }, [clearHide]);

  useEffect(
    () => () => {
      clearHide();
    },
    [clearHide],
  );

  const n = hidden.length;
  if (n === 0) return null;

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={scheduleHide}>
      <button
        type="button"
        className="text-left text-xs text-slate-500 underline decoration-dotted decoration-slate-400 underline-offset-2 hover:text-slate-800"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Pokaż ${n} dodatkowych lokalizacji`}
        onClick={(e) => e.stopPropagation()}
      >
        +{n} więcej
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-[60] w-max min-w-[180px] rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
          style={{ marginTop: "-6px" }}
          role="dialog"
          aria-label="Dodatkowe lokalizacje"
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex max-h-[min(60vh,20rem)] flex-col items-start gap-2 overflow-y-auto">
            {hidden.map((l, i) => (
              <LocationTypeBadge
                key={`${l.name}-overflow-${i}`}
                locationText={l.name}
                quantity={l.quantity}
                storageType={l.storage_type}
                showTypeIcon={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProductListLocationBadgeStack({
  locations,
}: {
  product: Product;
  locations: PhysicalInvLoc[];
  onOpenLocationOnMap: (payload: OpenLocationOnMapPayload) => void;
}) {
  if (locations.length === 0) {
    return <span className="text-xs text-slate-500">Brak lokalizacji</span>;
  }
  const visible = locations.slice(0, MAX_LOCATION_BADGES);
  const hidden = locations.slice(MAX_LOCATION_BADGES);
  return (
    <div className="flex w-full flex-col items-start gap-1">
      {visible.map((l, i) => (
        <LocationTypeBadge
          key={`${l.name}-${i}`}
          locationText={l.name}
          quantity={l.quantity}
          storageType={l.storage_type}
          showTypeIcon={false}
        />
      ))}
      {hidden.length > 0 && <LocationOverflowPopover hidden={hidden} />}
    </div>
  );
}
