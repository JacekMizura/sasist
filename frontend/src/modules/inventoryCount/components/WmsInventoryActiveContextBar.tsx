import { Boxes, MapPin, Package2, X } from "lucide-react";

import type { WmsCarrierContext, WmsLocationContext } from "../wmsInventoryExecutionContext";
import { LocationBadge } from "@/components/warehouse/LocationBadge";

type ActiveProduct = {
  product_name?: string | null;
  sku?: string | null;
  ean?: string | null;
};

type Props = {
  location: WmsLocationContext | null;
  carrier: WmsCarrierContext;
  activeProduct?: ActiveProduct | null;
  onEnterCarrierScan: () => void;
  onClearCarrier: () => void;
  carrierScanMode?: boolean;
  onSkipCarrier?: () => void;
};

export default function WmsInventoryActiveContextBar({
  location,
  carrier,
  activeProduct,
  onEnterCarrierScan,
  onClearCarrier,
  carrierScanMode,
  onSkipCarrier,
}: Props) {
  if (!location?.confirmed) {
    return (
      <div className="sticky top-0 z-20 rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2 shadow-sm">
        <p className="text-sm font-black text-amber-900">Zeskanuj lokalizację, aby rozpocząć liczenie</p>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-20 space-y-1 rounded-lg border border-slate-300 bg-white p-2 shadow-md">
      <ContextRow icon={MapPin} label="LOKALIZACJA" tone="location">
        <LocationBadge code={location.locationCode} type="PICK" />
      </ContextRow>

      {carrier ? (
        <ContextRow icon={Boxes} label="NOŚNIK" tone="carrier">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <p className="truncate font-mono text-base font-black text-[#1e4d8c]">{carrier.code}</p>
            <button
              type="button"
              onClick={onClearCarrier}
              className="shrink-0 rounded-md border border-[#1e4d8c]/30 bg-white p-1 text-slate-600 hover:bg-slate-50"
              aria-label="Usuń nośnik"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </ContextRow>
      ) : carrierScanMode ? (
        <ContextRow icon={Boxes} label="NOŚNIK" tone="scan">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="text-sm font-bold text-[#1e4d8c]">Skanuj kod nośnika…</span>
            {onSkipCarrier ? (
              <button type="button" onClick={onSkipCarrier} className="text-[11px] font-bold text-slate-500 underline">
                Anuluj
              </button>
            ) : null}
          </div>
        </ContextRow>
      ) : (
        <button
          type="button"
          onClick={onEnterCarrierScan}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-slate-200 bg-slate-50/80 px-2 py-1.5 text-[11px] font-bold text-slate-600 hover:border-[#1e4d8c]/40"
        >
          <Boxes className="h-3.5 w-3.5 text-[#1e4d8c]" />
          Przypisz nośnik (paleta / kontener)
        </button>
      )}

      {activeProduct ? (
        <ContextRow icon={Package2} label="PRODUKT" tone="product">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900">
              {activeProduct.product_name ?? activeProduct.sku ?? "—"}
            </p>
            {activeProduct.ean ? (
              <p className="truncate text-[10px] text-slate-500">EAN {activeProduct.ean}</p>
            ) : null}
          </div>
        </ContextRow>
      ) : (
        <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Zeskanuj produkt</p>
      )}
    </div>
  );
}

function ContextRow({
  icon: Icon,
  label,
  tone,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  tone: "location" | "carrier" | "product" | "scan";
  children: React.ReactNode;
}) {
  const bg =
    tone === "carrier"
      ? "bg-[#1e4d8c]/10 border-[#1e4d8c]/25"
      : tone === "product"
        ? "bg-emerald-50 border-emerald-200"
        : tone === "scan"
          ? "border-dashed border-[#1e4d8c]/40 bg-[#eef3fa]"
          : "bg-slate-50 border-slate-200";

  return (
    <div className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${bg}`}>
      <Icon
        className={`h-4 w-4 shrink-0 ${tone === "carrier" || tone === "scan" ? "text-[#1e4d8c]" : "text-slate-500"}`}
        strokeWidth={2.5}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-black tracking-widest text-slate-400">{label}</p>
        {children}
      </div>
    </div>
  );
}
