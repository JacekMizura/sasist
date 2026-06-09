import { Box, Package } from "lucide-react";

import {
  formatRelativeTimePl,
  type RecentLocationSession,
} from "../../recentLocationsStorage";
import { WMS_INV } from "./theme";

type Props = {
  items: RecentLocationSession[];
  disabled?: boolean;
  onSelect: (item: RecentLocationSession) => void;
};

function ProductThumb({ url, name }: { url?: string | null; name?: string | null }) {
  return (
    <div className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-100 bg-white">
      {url ? (
        <img src={url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
      ) : (
        <Package className="h-4 w-4 text-slate-300" strokeWidth={1.5} />
      )}
      <span className="sr-only">{name ?? "Produkt"}</span>
    </div>
  );
}

function LocationChip({ code }: { code: string }) {
  return (
    <div className="flex shrink-0 items-center rounded-xl border border-[#d6defc] bg-[#eff2fe] px-4 py-2 text-sm font-bold text-[#5a45d0]">
      <Box className="mr-2 h-4 w-4" />
      {code}
    </div>
  );
}

export default function WmsInventoryRecentLocationContext({ items, disabled, onSelect }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="w-full">
      <p className={`${WMS_INV.textLabel} mb-4`}>Ostatnie lokalizacje</p>
      <div className={`${WMS_INV.card} overflow-hidden`}>
        <ul>
          {items.map((item, index) => {
            const rel = formatRelativeTimePl(item.at);
            const hasProduct = Boolean(item.lastProductName && item.lastProductQty > 0);
            const ean = item.lastProductEan?.trim();
            const isLast = index === items.length - 1;

            return (
              <li key={item.taskId} className={isLast ? "" : "border-b border-slate-100"}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(item)}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-slate-50/80 disabled:opacity-40"
                >
                  {hasProduct ? (
                    <>
                      <div className="flex min-w-0 flex-1 items-center gap-6">
                        <LocationChip code={item.code} />
                        <div className="flex min-w-0 items-center gap-4">
                          <ProductThumb url={item.lastProductImageUrl} name={item.lastProductName} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-slate-800">{item.lastProductName}</div>
                            {ean ? (
                              <div className="mt-1 text-[11px] text-slate-500">
                                EAN: <span className="font-medium">{ean}</span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="block text-lg font-bold text-slate-800">{item.lastProductQty} szt.</span>
                        {rel ? <span className="text-xs text-slate-400">{rel}</span> : null}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-6">
                      <LocationChip code={item.code} />
                      <div className="text-sm font-medium text-slate-400">
                        Brak policzonych produktów
                        {rel ? (
                          <>
                            <span className="mx-2 text-slate-200">·</span>
                            {rel}
                          </>
                        ) : null}
                      </div>
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
