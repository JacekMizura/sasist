import { useCallback, useEffect, useState } from "react";
import { MapPin, Trash2, Plus, Minus, Image as ImageIcon, Barcode, Hash, PercentSquare, Tag } from "lucide-react";

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

// "Kuloodporna" funkcja rozdzielająca Netto i Brutto (radzi sobie z twardymi spacjami)
function splitPrice(label: string | null | undefined) {
  if (!label) return { gross: "", net: null, currency: "zł" };

  // Usuwamy wszystkie białe znaki i normalizujemy stringa
  const normalized = label.replace(/\s+/g, ' ').trim();
  
  // Szukamy ukośnika oddzielającego netto od brutto
  const parts = normalized.split(/\s*\/\s*/);
  
  if (parts.length === 2) {
    const net = parts[0].replace(/[^\d.,]/g, '').trim(); // Sama wartość netto
    const grossPart = parts[1];
    const gross = grossPart.replace(/[^\d.,]/g, '').trim(); // Sama wartość brutto
    const currency = grossPart.replace(/[\d.,]/g, '').trim() || 'zł'; // Wyciągamy 'zł'
    
    return { net, gross, currency };
  }

  // Jeśli ustawienia pokazują tylko jedną cenę (brak ukośnika)
  const gross = normalized.replace(/[^\d.,]/g, '').trim();
  const currency = normalized.replace(/[\d.,]/g, '').trim() || 'zł';
  return { gross, net: null, currency };
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

  // Bezpieczne rozdzielanie cen
  const parsedTotal = splitPrice(lineTotalLabel);
  const parsedUnit = splitPrice(unitLabel);

  return (
    <>
      <li className="bg-white rounded-3xl border border-blue-50 p-5 flex flex-col xl:flex-row gap-6 items-center shadow-[0_8px_30px_rgb(59,130,246,0.04)] hover:border-blue-100 transition-all">
        
        {/* 1. Obrazek (Bez ramki, wtopiony w tło) */}
        <div className="w-24 h-24 flex-shrink-0 flex items-center justify-center">
          {resolvedDirectSalesSettings.show_product_images && line.image_url ? (
            <img 
              src={line.image_url} 
              alt="" 
              className="w-full h-full object-contain mix-blend-multiply" 
            />
          ) : (
            <ImageIcon size={32} className="text-slate-200" />
          )}
        </div>

        {/* 2. Informacje o produkcie */}
        <div className="flex-1 w-full min-w-0">
          <h3 className="text-xl font-bold text-slate-900 leading-tight truncate">
            {safeDisplay(line.product_name, `Produkt #${line.product_id}`)}
          </h3>

          <div className="flex flex-wrap items-center gap-8 mt-3">
            {resolvedDirectSalesSettings.show_sku && line.product_sku && (
              <div className="flex flex-col">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                  <Hash size={12} /> Symbol
                </div>
                <div className="text-sm font-bold text-slate-900 tracking-wide">{line.product_sku}</div>
              </div>
            )}
            
            {resolvedDirectSalesSettings.show_ean && line.product_ean && (
              <div className="flex flex-col">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                  <Barcode size={12} /> EAN
                </div>
                <div className="text-sm font-bold text-slate-900 tracking-wide">{line.product_ean}</div>
              </div>
            )}

            {resolvedDirectSalesSettings.show_catalog_number && line.product_catalog_number && (
              <div className="flex flex-col">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                  <Tag size={12} /> Nr Kat.
                </div>
                <div className="text-sm font-bold text-slate-900 tracking-wide">{line.product_catalog_number}</div>
              </div>
            )}

            {resolvedDirectSalesSettings.show_margin && line.margin_percent != null && (
              <div className="flex flex-col">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                  <PercentSquare size={12} /> Marża
                </div>
                <div className="text-sm font-bold text-emerald-600 tracking-wide">
                  {formatDirectSalesMargin(line.margin_percent)}
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
              <span className="bg-violet-50 text-violet-700 border border-violet-100 px-2 py-1 rounded-lg text-xs font-bold tracking-wide">
                REZERWACJA
              </span>
            ) : null}
          </div>
        </div>

        {/* 3. Kontrolki Ilości */}
        <div className="flex items-center gap-2 pl-0 xl:pl-4 w-full xl:w-auto">
          <button
            type="button"
            disabled={busy}
            onClick={() => onQtyChange(line.id, Math.max(1, line.quantity - 1))}
            className="w-12 h-12 rounded-xl border border-blue-50 text-blue-600 hover:bg-slate-50 flex justify-center items-center transition-all disabled:opacity-50"
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
            className="w-10 text-center text-xl font-bold text-slate-900 bg-transparent focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => onQtyChange(line.id, line.quantity + 1)}
            className="w-12 h-12 rounded-xl border border-blue-50 text-blue-600 hover:bg-slate-50 flex justify-center items-center transition-all disabled:opacity-50"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* 4. CENA - CZYSTA I NOWOCZESNA */}
        <div className="text-right min-w-[140px] hidden xl:block">
          {/* Wielkie Brutto */}
          <div className="text-3xl font-black text-slate-900 whitespace-nowrap tracking-tight">
            {parsedTotal.gross} <span className="text-xl text-slate-400">{parsedTotal.currency}</span>
          </div>
          {/* Małe Netto */}
          {parsedTotal.net && (
            <div className="text-xs font-bold text-slate-400 mt-1 whitespace-nowrap">
              {parsedTotal.net} {parsedTotal.currency} netto
            </div>
          )}
          {/* Cena jednostkowa x ilość */}
          <div className="text-[11px] font-medium text-slate-400 mt-0.5 whitespace-nowrap">
            {parsedUnit.gross} {parsedUnit.currency} × {line.quantity}
          </div>
        </div>

        {/* 5. Akcje (Widok Mobilny Cen + Przyciski) */}
        <div className="flex flex-col gap-2 w-full sm:w-auto xl:ml-2">
          {/* Mobilny widok ceny */}
          <div className="xl:hidden flex justify-between items-center mb-2 px-1">
            <div className="text-xs font-bold text-slate-400">
              {parsedUnit.gross} {parsedUnit.currency} × {line.quantity}
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-slate-900">
                {parsedTotal.gross} <span className="text-sm text-slate-400">{parsedTotal.currency}</span>
              </div>
              {parsedTotal.net && <div className="text-[10px] font-bold text-slate-400">{parsedTotal.net} {parsedTotal.currency} netto</div>}
            </div>
          </div>
          
          <button
            type="button"
            disabled={busy}
            onClick={() => setLocOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-blue-700 rounded-lg hover:bg-slate-50 font-bold text-xs transition-all disabled:opacity-50"
          >
            <MapPin size={14} /> Lokalizacja
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(line.id)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-red-100 text-red-600 rounded-lg hover:bg-red-50 font-bold text-xs transition-all disabled:opacity-50"
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