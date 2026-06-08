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

export default function WmsInventoryRecentLocationContext({ items, disabled, onSelect }: Props) {
  if (items.length === 0) return null;

  return (
    <section>
      <p className={WMS_INV.textLabel}>Ostatnie lokalizacje</p>
      <ul className="mt-0.5 divide-y divide-slate-100">
        {items.map((item) => {
          const rel = formatRelativeTimePl(item.at);
          const hasProduct = Boolean(item.lastProductName && item.lastProductQty > 0);
          const subtitle = hasProduct
            ? `${item.lastProductQty} szt. · ${item.lastProductName}`
            : "Brak policzonych produktów";

          return (
            <li key={item.taskId}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(item)}
                className="flex w-full items-start gap-2 py-1.5 text-left active:bg-slate-50 disabled:opacity-40"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <LocationBadge code={item.code} type="PICK" className="!text-sm !font-black" />
                  <p className="truncate pl-0.5 text-[11px] font-semibold leading-tight text-slate-600">
                    {subtitle}
                  </p>
                </div>
                {rel ? (
                  <span className="shrink-0 pt-0.5 text-[10px] font-bold tabular-nums text-slate-400">{rel}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
