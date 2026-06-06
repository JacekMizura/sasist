import { useCallback, useEffect, useState } from "react";
import { MapPin, Trash2, Plus, Minus, Image as ImageIcon } from "lucide-react";

import { fetchLocationStock } from "../../api/locationStockApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import {
  formatDirectSalesLineTotal,
  formatDirectSalesMargin,
  formatDirectSalesUnitPrice,
} from "../../modules/directSales/settings/formatDirectSalesPrice";
import { useResolvedDirectSalesSettings } from "../../modules/directSales/settings/resolvedDirectSalesSettings";
import type { DirectSaleSessionLine } from "../../utils/normalizeDirectSales";
import { safeDisplay } from "../../utils/safeStrings";
import { LocationPickerModal } from "./location/LocationPickerModal";
import { LocationBadge } from "./stock/LocationBadge";
import { LineStockBadge } from "./stock/LineStockBadge";

type Props = {
  line: DirectSaleSessionLine;
  warehouseId: number;
  busy: boolean;
  onQtyChange: (lineId: number, qty: number) => void;
  onLocationChange: (lineId: number, locationId: number | null) => void;
  onRemove: (lineId: number) => void;
};

function lineMetaParts(
  line: DirectSaleSessionLine,
  settings: ReturnType<typeof useResolvedDirectSalesSettings>,
): string[] {
  const parts: string[] = [];
  if (settings.show_sku) {
    const sku = safeDisplay(line.product_sku, "");
    if (sku) parts.push(sku);
  }
  if (settings.show_ean && line.product_ean) parts.push(`EAN ${line.product_ean}`);
  if (settings.show_catalog_number && line.product_catalog_number) {
    parts.push(`kat. ${line.product_catalog_number}`);
  }
  if (settings.show_margin && line.margin_percent != null) {
    const margin = formatDirectSalesMargin(line.margin_percent);
    if (margin) parts.push(margin);
  }
  return parts;
}

export function SessionLineCard({
  line,
  warehouseId,
  busy,
  onQtyChange,
  onLocationChange,
  onRemove,
}: Props) {
  const resolvedDirectSalesSettings = useResolvedDirectSalesSettings();
  const [locOpen, setLocOpen] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [locRows, setLocRows] = useState<Awaited<ReturnType<typeof fetchLocationStock>>["locations"]>([]);
  const [qtyDraft, setQtyDraft] = useState(String(line.quantity));

  useEffect(() => setQtyDraft(String(line.quantity)), [line.quantity]);

  useEffect(() => {
    if (!locOpen) return;
    let cancelled = false;
    setLocLoading(true);
    void fetchLocationStock({
      tenantId: DAMAGE_TENANT_ID,
      warehouseId,
      productId: line.product_id,
      availableOnly: resolvedDirectSalesSettings.hide_empty_locations,
    })
      .then((snap) => {
        if (!cancelled) setLocRows(snap.locations ?? []);
      })
      .catch(() => {
        if (!cancelled) setLocRows([]);
      })
      .finally(() => {
        if (!cancelled) setLocLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locOpen, warehouseId, line.product_id, resolvedDirectSalesSettings.hide_empty_locations]);

  const commitQty = useCallback(() => {
    const n = Number(qtyDraft.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setQtyDraft(String(line.quantity));
      return;
    }
    onQtyChange(line.id, n);
  }, [qtyDraft, line.id, line.quantity, onQtyChange]);

  const meta = lineMetaParts(line, resolvedDirectSalesSettings);
  const unitLabel = formatDirectSalesUnitPrice(
    line.unit_price,
    resolvedDirectSalesSettings.price_display,
    line.margin_percent,
  );
  const lineTotalLabel = formatDirectSalesLineTotal(
    line.unit_price,
    line.quantity,
    line.discount_amount,
    resolvedDirectSalesSettings.price_display,
    line.margin_percent,
  );

  return (
    <>
      {/* Przechodzimy z płaskiej listy <li> na nowoczesne, odrębne karty */}
      <li className="bg-white rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-blue-50/80 flex flex-col xl:flex-row xl:items-center gap-6 group hover:border-blue-200 transition-colors">
        
        {/* Obrazek i Informacje o produkcie */}
        <div className="flex gap-5 flex-1 min-w-0">
          
          {/* Obrazek z nowoczesnym zaokrągleniem i pastelowym tłem na wypadek braku */}
          <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-inner">
            {resolvedDirectSalesSettings.show_product_images && line.image_url ? (
              <img src={line.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={24} className="text-slate-300" />
            )}
          </div>
          
          <div className="flex flex-col justify-center min-w-0">
            <h3 className="text-lg font-bold text-slate-900 leading-tight truncate">
              {safeDisplay(line.product_name, `Produkt #${line.product_id}`)}
            </h3>
            
            <p className="text-sm text-slate-500 mt-1 font-medium truncate">
              {meta.length ? meta.join(" • ") : "—"}
            </p>
            
            {/* Tagi lokalizacji / stocku / rezerwacji */}
            <div className="flex flex-wrap gap-2 mt-3">
              <LocationBadge code={line.source_location_code} zoneType={line.operational_zone_type} />
              
              {resolvedDirectSalesSettings.show_stock ? (
                <LineStockBadge available={line.available_qty_hint} orderedQty={line.quantity} inCart />
              ) : null}
              
              {line.has_reservation ? (
                <span className="bg-violet-50 text-violet-700 border border-violet-100 px-2 py-1 rounded-lg text-xs font-bold tracking-wide">
                  REZERWACJA
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Kontrolki Ilości, Cena i Akcje */}
        <div className="flex flex-col sm:flex-row items-center gap-6 xl:gap-8 justify-between xl:justify-end border-t xl:border-t-0 border-blue-50 pt-5 xl:pt-0">
          
          {/* Zintegrowany Stepper Ilości */}
          <div className="flex items-center bg-white border-2 border-blue-50 rounded-xl overflow-hidden shadow-sm focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <button
              type="button"
              disabled={busy}
              onClick={() => onQtyChange(line.id, Math.max(1, line.quantity - 1))}
              className="w-12 h-12 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-blue-50 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
            >
              <Minus size={18} />
            </button>
            <input
              type="text"
              inputMode="decimal"
              disabled={busy}
              value={qtyDraft}
              onChange={(e) => setQtyDraft(e.target.value)}
              onBlur={commitQty}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitQty();
                }
              }}
              className="w-14 h-12 text-center font-bold text-lg text-slate-900 border-x-2 border-blue-50 bg-transparent focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => onQtyChange(line.id, line.quantity + 1)}
              className="w-12 h-12 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-blue-50 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
            >
              <Plus size={18} />
            </button>
          </div>

          {/* Cena (Duża kwota całkowita i mała informacja o cenie jednostkowej) */}
          <div className="text-right flex-shrink-0 min-w-[100px]">
            <div className="text-2xl font-black text-slate-900 whitespace-nowrap">
              {lineTotalLabel}
            </div>
            <div className="text-xs font-medium text-slate-400 mt-1 whitespace-nowrap">
              {unitLabel ? `${unitLabel} × ${line.quantity}` : `× ${line.quantity}`}
            </div>
          </div>

          {/* Przyciski Akcji (Lokalizacja, Usuń) */}
          <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={busy}
              onClick={() => setLocOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors"
            >
              <MapPin size={14} /> <span className="sm:hidden xl:inline">Lokalizacja</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemove(line.id)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 hover:text-red-700 disabled:opacity-50 transition-colors"
            >
              <Trash2 size={14} /> <span className="sm:hidden xl:inline">Usuń</span>
            </button>
          </div>

        </div>
      </li>

      {/* Modal wyboru pozostaje bez zmian wizualnych na tym etapie */}
      <LocationPickerModal
        open={locOpen}
        loading={locLoading}
        rows={locRows}
        currentLocationId={line.source_location_id}
        onClose={() => setLocOpen(false)}
        onPick={(locationId) => {
          onLocationChange(line.id, locationId);
          setLocOpen(false);
        }}
      />
    </>
  );
}