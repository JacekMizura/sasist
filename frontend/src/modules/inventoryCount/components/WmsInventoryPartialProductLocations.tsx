import { useEffect, useState } from "react";

import { getWmsProductView, type WmsProductViewLocationApi } from "@/api/wmsProductViewApi";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import { formatWarehouseLocationTypeLabel } from "@/utils/warehouseLocationTypeLabels";
import { WMS_INV } from "../wmsIndustrialTheme";

type Props = {
  tenantId: number;
  warehouseId: number;
  productId: number | null | undefined;
  currentLocationId: number | null | undefined;
};

function badgeToStorageType(badge: string, locationType?: string | null): unknown {
  const lt = (locationType ?? "").trim().toUpperCase();
  if (lt === "PICK_START") return "pick";
  const b = badge.trim().toLowerCase();
  if (b.includes("podstaw")) return "primary";
  if (b.includes("zapas")) return "reserve";
  if (b === "floor") return "buffer";
  if (b.includes("przyj")) return "pick";
  return "unknown";
}

function isPickLocation(loc: WmsProductViewLocationApi): boolean {
  const lt = (loc.location_type ?? "").trim().toUpperCase();
  return lt === "PICK_START" || lt === "KOMPLETACJA";
}

export default function WmsInventoryPartialProductLocations({
  tenantId,
  warehouseId,
  productId,
  currentLocationId,
}: Props) {
  const [locations, setLocations] = useState<WmsProductViewLocationApi[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId || !Number.isFinite(productId)) {
      setLocations([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void getWmsProductView(tenantId, warehouseId, productId)
      .then((view) => {
        if (!cancelled) setLocations(view.locations ?? []);
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productId, tenantId, warehouseId]);

  if (!productId) return null;

  return (
    <section>
      <p className={WMS_INV.textLabel}>Lokalizacje produktu</p>
      {loading ? (
        <p className="text-[11px] font-bold text-slate-400">…</p>
      ) : locations.length === 0 ? (
        <p className="text-[11px] font-bold text-slate-400">Brak stanów w magazynie.</p>
      ) : (
        <ul className="mt-0.5 space-y-1">
          {locations.map((loc) => {
            const isCurrent = currentLocationId != null && loc.location_id === currentLocationId;
            return (
              <li
                key={loc.location_id}
                className={`flex flex-wrap items-center justify-between gap-1.5 ${isCurrent ? "opacity-100" : ""}`}
              >
                <LocationBadge
                  code={loc.code}
                  type={loc.badge}
                  storageType={badgeToStorageType(loc.badge, loc.location_type)}
                  quantity={loc.quantity}
                  layoutSpread
                  className="min-w-0 flex-1"
                />
                {isPickLocation(loc) ? (
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-[#1e4d8c]">
                    {formatWarehouseLocationTypeLabel(loc.location_type ?? "PICK_START")}
                  </span>
                ) : loc.location_type && loc.location_type !== "NORMAL" ? (
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                    {formatWarehouseLocationTypeLabel(loc.location_type)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
