import { useCallback, useEffect, useState } from "react";
import { MapPin, Trash2, Plus, Minus, Image as ImageIcon, Barcode, Hash, PercentSquare, Tag } from "lucide-react";

import { fetchLocationStock } from "../../api/locationStockApi";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import {
  formatDirectSalesLineTotal,
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

// Funkcja pomocnicza, która "rozcina" starą formatkę ceny na Brutto i Netto
function parsePrice(label: string | null) {
  if (!label) return { main: "", sub: null };
  if (label.includes(" / ")) {
    const [net, gross] = label.split(" / ");
    return { main: gross, sub: `${net} netto` };
  }
  return { main: label, sub: null };
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

  // Pobieramy surowe stringi i formatujemy je do nowego widoku
  const rawUnitLabel = formatDirectSalesUnitPrice(line.unit_price, resolvedDirectSalesSettings.price_display, line.margin_percent);
  const rawTotalLabel = formatDirectSalesLineTotal(line.unit_price, line.quantity, line.discount_amount, resolvedDirectSalesSettings.price_display, line.margin_percent);
  
  const parsedTotal = parsePrice(rawTotalLabel);
  const parsedUnit = parsePrice(rawUnitLabel);

  return (
    <>
      <li className="bg-white rounded-[1.5rem] border border-blue-50 p-4 lg:p-5 flex flex-col xl:flex-row gap-4 lg:gap-6 items-center shadow-[0_8px_30px_rgb(59,130,246,0.06)] hover:border-blue-100 transition-all">
        
        {/* 1. Obrazek */}
        <div className="w-20 h-20 lg:w-24 lg:h-24 flex-shrink-0 flex items-center justify-center bg-white rounded-2xl">
          {resolvedDirectSalesSettings.show_product_images && line.image_url ? (
            <img 
              src={line.image_url} 
              alt="" 
              className="w-full h-full object-contain mix-blend-multiply" 
            />
          ) : (
            <ImageIcon size={32} className="text-blue-50" />
          )}
        </div>

        {/* 2. Informacje o produkcie */}
        <div className="flex-1 w-full min-w-0">
          <h3 className="text-lg lg:text-xl font-bold text-slate-900 leading-tight truncate">
            {safeDisplay(line.product_name, `Produkt #${line.product_id}`)}
          </h3>

          <div className="flex flex-wrap items-center gap-4 lg:gap-6 mt-3">
            {resolvedDirectSalesSettings.show_sku && line.product_sku && (
              <div className="flex flex-col">
                <div className="text-[10px] font-bold text-blue-900/40 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                  <Hash size={10} /> Symbol
                </div>
                <div className="text-sm font-black text-slate-900 tracking-wide">{line.product_sku}</div>
              </div>
            )}
            
            {resolvedDirectSalesSettings.show_ean && line.product_ean && (
              <div className="flex flex-col">
                <div className="text-[10px] font-bold text-blue-900/40 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                  <Barcode size={10} /> EAN
                </div>
                <div className="text-sm font-black text-slate-900 tracking-wide">{line.product_ean}</div>
              </div>
            )}

            {resolvedDirectSalesSettings.show_catalog_number && line.product_catalog_number && (
              <div className="flex flex-col">
                <div className="text-[10px] font-bold text-blue-900/40 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                  <Tag size={10} /> Nr Kat.
                </div>
                <div className="text-sm font-black text-slate-900 tracking-wide">{line.product_catalog_number}</div>
              </div>
            )}

            {resolvedDirectSalesSettings.show_margin && line.margin_percent != null && (
              <div className="flex flex-col">
                <div className="text-[10px] font-bold text-blue-900/40 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                  <PercentSquare size={10} /> Marża
                </div>
                {/* Wymuszamy format X.X% bez powielonego słowa "marża" */}
                <div className="text-sm font-black text-emerald-600 tracking-wide">
                  {line.margin_percent.toFixed(1)}%
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <LocationBadge code={line.source_location_code} zoneType={line.operational_zone_type} />
            {resolvedDirectSalesSettings.show_stock ? (
              <LineStockBadge available={line.available_qty_hint} orderedQty={line.quantity} inCart />
            ) : null}
            {line.has_reservation ? (
              <span className="bg-violet-50 text-violet-700 border border-violet-100 px-2 py-1 rounded-lg text-[10px] font-bold tracking-wide">
                REZERWACJA
              </span>
            ) : null}
          </div>
        </div>

        {/* 3. Kontrolki Ilości */}
        <div className="flex items-center gap-1 pl-0 xl:pl-4 border-l-0 xl:border-l border-blue-50 pt-4 xl:pt-0 border-t xl:border-t-0 w-full xl:w-auto">
          <button
            type="button"
            disabled={busy}
            onClick={() => onQtyChange(line.id, Math.max(1, line.quantity - 1))}
            className="w-10 h-10 rounded-xl bg-white border-2 border-blue-50 text-blue-600 hover:bg-blue-50 hover:border-blue-100 flex justify-center items-center font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
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
            className="w-14 h-10 text-center text-xl font-black text-slate-900 bg-transparent focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => onQtyChange(line.id, line.quantity + 1)}
            className="w-10 h-10 rounded-xl bg-white border-2 border-blue-50 text-blue-600 hover:bg-blue-50 hover:border-blue-100 flex justify-center items-center font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* 4. Cena (Z rozdzieleniem Brutto/Netto) */}
        <div className="text-right min-w-[130px] hidden xl:block">
          <div className="text-2xl font-black text-slate-900 whitespace-nowrap tracking-tight">
            {parsedTotal.main.replace("zł", "").trim()} <span className="text-base text-blue-900/40">zł</span>
          </div>
          {parsedTotal.sub && (
            <div className="text-[11px] font-bold text-blue-900/40 mt-0.5 whitespace-nowrap">
              {parsedTotal.sub}
            </div>
          )}
          <div className="text-[10px] font-bold text-blue-900/40 mt-1 whitespace-nowrap">
            {parsedUnit.main} × {line.quantity}
          </div>
        </div>

        {/* 5. Akcje */}
        <div className="flex flex-col gap-2 w-full xl:w-auto xl:ml-2">
          {/* Widok ceny dla mniejszych ekranów */}
          <div className="xl:hidden flex justify-between items-center mb-2 px-1">
            <div className="text-xs font-bold text-blue-900/40">
              {parsedUnit.main} × {line.quantity}
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-slate-900">{parsedTotal.main}</div>
              {parsedTotal.sub && <div className="text-[10px] font-bold text-blue-900/40">{parsedTotal.sub}</div>}
            </div>
          </div>
          
          <button
            type="button"
            disabled={busy}
            onClick={() => setLocOpen(true)}
            className="flex w-full items-center justify-center gap-2 px-3 py-2 bg-white border-2 border-blue-50 text-blue-700 rounded-xl hover:bg-blue-50 hover:border-blue-100 font-bold text-xs transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <MapPin size={14} /> Lokalizacja
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(line.id)}
            className="flex w-full items-center justify-center gap-2 px-3 py-2 bg-white border-2 border-red-50 text-red-600 rounded-xl hover:bg-red-50 hover:border-red-100 font-bold text-xs transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Trash2 size={14} /> Usuń
          </button>
        </div>

      </li>

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