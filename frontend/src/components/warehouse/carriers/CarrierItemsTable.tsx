import { useNavigate } from "react-router-dom";

import type { WarehouseCarrierItemRead } from "../../../api/wmsCarrierApi";
import { DamageDispositionBadge } from "../../inventory/DamageDispositionBadge";
import { formatExpiryDatePl } from "../../../pages/wms/putawayFormat";
import { getProductDetailsPath, productDetailsNavState } from "../../../pages/Products/productPaths";
import { CarrierProductThumb } from "./CarrierProductThumb";

function itemRowKey(it: WarehouseCarrierItemRead): string {
  return [
    it.product_id,
    (it.batch_number || "").trim(),
    it.expiry_date || "",
    (it.serial_number || "").trim(),
    it.id,
  ].join("|");
}

function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso || !String(iso).trim()) return null;
  const s = String(iso).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function ExpiryCell({ iso }: { iso: string | null | undefined }) {
  const label = formatExpiryDatePl(iso);
  if (!label) return <span className="text-slate-400">—</span>;
  const d = parseIsoDate(iso);
  if (!d) return <span className="font-mono text-[13px] text-slate-700">{label}</span>;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cmp = new Date(d);
  cmp.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((cmp.getTime() - today.getTime()) / 86400000);

  let badge: { text: string; className: string } | null = null;
  if (diffDays < 0) {
    badge = { text: "Przeterminowane", className: "bg-rose-100 text-rose-900" };
  } else if (diffDays <= 30) {
    badge = { text: "Wkrótce", className: "bg-amber-100 text-amber-950" };
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[13px] text-slate-800">{label}</span>
      {badge ? (
        <span className={`inline-flex w-fit rounded-full px-1.5 py-px text-[10px] font-bold uppercase ${badge.className}`}>
          {badge.text}
        </span>
      ) : null}
    </div>
  );
}

type Props = {
  items: WarehouseCarrierItemRead[];
  tenantId?: number | null;
};

export function CarrierItemsTable({ items, tenantId }: Props) {
  const navigate = useNavigate();

  /** Pełna karta produktu z katalogu (Asortyment). */
  const openProduct = (productId: number) => {
    if (productId < 1) return;
    navigate(getProductDetailsPath(productId), {
      state: productDetailsNavState({
        tenantId: tenantId != null && tenantId >= 1 ? tenantId : undefined,
      }),
    });
  };

  if (!items.length) {
    return <p className="text-[14px] text-slate-500">Brak pozycji na nośniku.</p>;
  }

  return (
    <div className="max-h-[min(70vh,640px)] overflow-auto">
      <table className="w-full min-w-[880px] text-left">
        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-14 px-2 py-2" />
            <th className="px-2 py-2 min-w-[160px]">Produkt</th>
            <th className="px-2 py-2">Partia</th>
            <th className="px-2 py-2">Ważność</th>
            <th className="px-2 py-2">Seryjny</th>
            <th className="px-2 py-2">Stan</th>
            <th className="px-2 py-2 text-right">Ilość</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const sku = (it.product_sku || "").trim();
            const ean = (it.product_ean || "").trim();
            const name = (it.product_name || "").trim() || sku || `#${it.product_id}`;
            const meta = [sku, ean].filter(Boolean).join(" · ") || "—";
            const batch = (it.batch_number || "").trim() || "—";
            const serial = (it.serial_number || "").trim() || "—";

            return (
              <tr
                key={itemRowKey(it)}
                role="link"
                tabIndex={0}
                onClick={() => openProduct(it.product_id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openProduct(it.product_id);
                  }
                }}
                className="cursor-pointer border-b border-slate-100 align-middle last:border-0 hover:bg-slate-50"
              >
                <td className="px-2 py-2">
                  <CarrierProductThumb imageUrl={it.product_image_url} alt={name} size="lg" />
                </td>
                <td className="px-2 py-2">
                  <p className="text-[15px] font-semibold leading-snug text-slate-900">{name}</p>
                  <p className="mt-0.5 font-mono text-[12px] text-slate-500">{meta}</p>
                </td>
                <td className="px-2 py-2 font-mono text-[13px] text-slate-700">{batch}</td>
                <td className="px-2 py-2">
                  <ExpiryCell iso={it.expiry_date} />
                </td>
                <td className="px-2 py-2 font-mono text-[13px] text-violet-900">{serial}</td>
                <td className="px-2 py-2">
                  <DamageDispositionBadge
                    stockDisposition={it.stock_disposition}
                    damageClass={it.damage_class}
                    dispositionBadge={it.disposition_badge}
                    damageTrace={it.damage_trace}
                  />
                </td>
                <td className="px-2 py-2 text-right text-[17px] font-black tabular-nums text-slate-900">
                  {it.quantity}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
