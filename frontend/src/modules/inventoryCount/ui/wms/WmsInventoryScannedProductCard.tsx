import { MapPin, Package } from "lucide-react";

import type { WmsBarcodeResolveResult } from "@/api/inventoryCountApi";
import { WMS_INV } from "./theme";

const DISC_BADGE: Record<string, { label: string; className: string }> = {
  EXPECTED: { label: "Zgodnie z planem", className: WMS_INV.successSoft },
  EXTRA_PRODUCT: { label: "Nadwyżka", className: WMS_INV.warning },
  UNPLANNED_PRODUCT: { label: "Spoza inwentaryzacji", className: WMS_INV.warning },
  WRONG_LOCATION: { label: "Inna lokalizacja", className: WMS_INV.critical },
  UNKNOWN_PRODUCT: { label: "Nieznany produkt", className: "bg-[#eef0f3] text-[#5a6b7d] border-[#c5d0de]" },
};

type Props = {
  scan: WmsBarcodeResolveResult | null;
  carrierCode?: string | null;
  pulse?: "success" | "warning" | "error" | null;
};

export default function WmsInventoryScannedProductCard({ scan, carrierCode, pulse }: Props) {
  if (!scan) {
    return (
      <section
        className={`rounded-xl border-2 border-dashed ${WMS_INV.border} ${WMS_INV.surface} px-4 py-10 text-center`}
      >
        <Package className="mx-auto h-12 w-12 text-[#c5d0de]" />
        <p className="mt-3 text-sm font-bold text-[#5a6b7d]">Zeskanuj produkt — karta pojawi się tutaj</p>
      </section>
    );
  }

  const disc = DISC_BADGE[scan.discrepancy_class] ?? {
    label: scan.discrepancy_label,
    className: WMS_INV.warning,
  };
  const expected = scan.expected_quantity ?? 0;
  const counted = scan.counted_quantity ?? 0;
  const diff = scan.difference_quantity ?? counted - expected;
  const diffPositive = diff > 0;
  const diffNegative = diff < 0;

  const pulseRing =
    pulse === "success"
      ? "ring-4 ring-[#1a7f4b]/40"
      : pulse === "warning"
        ? "ring-4 ring-[#e87722]/40"
        : pulse === "error"
          ? "ring-4 ring-[#b42318]/40"
          : "";

  return (
    <section
      className={`overflow-hidden rounded-xl border-2 ${WMS_INV.borderStrong} ${WMS_INV.surface} shadow-md transition-all duration-300 ${pulseRing}`}
    >
      <div className="flex gap-4 p-4">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-[#c5d0de] bg-[#f4f6fa]">
          {scan.image_url ? (
            <img src={scan.image_url} alt="" className="max-h-full max-w-full object-contain p-1" />
          ) : (
            <Package className="h-10 w-10 text-[#8a9bb0]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black leading-tight text-[#1a2b3c]">{scan.product_name ?? "—"}</h2>
          <p className="mt-1 font-mono text-sm font-bold text-[#5a6b7d]">
            EAN: {scan.ean ?? scan.barcode ?? "—"}
          </p>
          <p className="font-mono text-sm font-bold text-[#5a6b7d]">SKU: {scan.sku ?? "—"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${disc.className}`}>
              {disc.label}
            </span>
            {scan.location_code ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-[#c5d0de] bg-[#eef3fa] px-2 py-0.5 text-[10px] font-black uppercase text-[#1e4d8c]">
                <MapPin className="h-3 w-3" />
                {scan.location_code}
              </span>
            ) : null}
            {carrierCode ? (
              <span className="rounded-md border border-[#c5d0de] bg-white px-2 py-0.5 text-[10px] font-black uppercase text-[#5a6b7d]">
                Nośnik: {carrierCode}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-[#c5d0de] border-t-2 border-[#c5d0de] bg-[#f4f6fa]">
        <div className="px-3 py-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#5a6b7d]">Oczekiwane</p>
          <p className="text-2xl font-black tabular-nums text-[#1a2b3c]">{expected}</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#1e4d8c]">Policzone</p>
          <p className="text-3xl font-black tabular-nums text-[#1e4d8c]">{counted}</p>
        </div>
        <div className="px-3 py-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#5a6b7d]">Różnica</p>
          <p
            className={`text-2xl font-black tabular-nums ${
              diffPositive ? "text-[#b45309]" : diffNegative ? "text-[#b42318]" : "text-[#1a7f4b]"
            }`}
          >
            {diff > 0 ? `+${diff}` : diff}
          </p>
        </div>
      </div>
    </section>
  );
}
