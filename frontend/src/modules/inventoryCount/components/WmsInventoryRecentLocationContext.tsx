import { Package } from "lucide-react";

import { LocationBadge } from "@/components/warehouse/LocationBadge";

import {
  formatRelativeTimePl,
  type RecentLocationSession,
} from "../recentLocationsStorage";
import { WMS_INV } from "../wmsIndustrialTheme";

type Props = {
  items: RecentLocationSession[];
  disabled?: boolean;
  onSelect: (item: RecentLocationSession) => void;
};

function ProductThumb({ url, name }: { url?: string | null; name?: string | null }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center">
      {url ? (
        <img src={url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
      ) : (
        <Package className="h-4 w-4 text-slate-300" strokeWidth={1.5} />
      )}
      <span className="sr-only">{name ?? "Produkt"}</span>
    </div>
  );
}

export default function WmsInventoryRecentLocationContext({ items, disabled, onSelect }: Props) {
  if (items.length === 0) return null;

  return (
    <section>
      <p className={WMS_INV.textLabel}>Ostatnie lokalizacje</p>
      <ul className="mt-0.5 divide-y divide-slate-100">
        {items.map((item) => {
          const rel = formatRelativeTimePl(item.at);
          const hasProduct = Boolean(item.lastProductName && item.lastProductQty > 0);
          const ean = item.lastProductEan?.trim();

          return (
            <li key={item.taskId}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(item)}
                className="flex w-full items-start gap-1.5 py-1 text-left active:bg-slate-50/80 disabled:opacity-40"
              >
                <LocationBadge code={item.code} type="PICK" className="shrink-0 !py-0.5 !text-xs !font-black" />

                {hasProduct ? (
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <ProductThumb url={item.lastProductImageUrl} name={item.lastProductName} />
                      <p className="min-w-0 flex-1 truncate text-[11px] font-black text-slate-900">
                        {item.lastProductName}
                      </p>
                    </div>
                    {ean ? (
                      <p className="truncate pl-[42px] font-mono text-[10px] text-slate-500">EAN: {ean}</p>
                    ) : null}
                    <p className="truncate pl-[42px] text-[10px] font-bold text-slate-600">
                      <span className="font-black tabular-nums text-[#1e4d8c]">{item.lastProductQty} szt.</span>
                      {rel ? <span className="font-semibold text-slate-400"> · {rel}</span> : null}
                    </p>
                  </div>
                ) : (
                  <p className="min-w-0 flex-1 self-center truncate py-0.5 text-[11px] font-semibold text-slate-400">
                    Brak policzonych produktów
                    {rel ? <span className="text-slate-300"> · {rel}</span> : null}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
