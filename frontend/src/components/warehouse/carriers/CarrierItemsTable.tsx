import { ImageIcon } from "lucide-react";
import type { WarehouseCarrierItemRead } from "../../../api/wmsCarrierApi";
import { formatExpiryDatePl } from "../../../pages/wms/putawayFormat";

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
  if (!d) return <span className="font-mono text-slate-800">{label}</span>;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cmp = new Date(d);
  cmp.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((cmp.getTime() - today.getTime()) / 86400000);

  let badge: { text: string; className: string } | null = null;
  if (diffDays < 0) {
    badge = { text: "Przeterminowane", className: "bg-rose-100 text-rose-900 border-rose-200" };
  } else if (diffDays <= 30) {
    badge = { text: "Wkrótce", className: "bg-amber-100 text-amber-950 border-amber-200" };
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-slate-800">{label}</span>
      {badge ? (
        <span className={`inline-flex w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${badge.className}`}>
          {badge.text}
        </span>
      ) : null}
    </div>
  );
}

export function CarrierItemsTable({ items }: { items: WarehouseCarrierItemRead[] }) {
  if (!items.length) {
    return <p className="text-sm text-slate-600">Brak pozycji na nośniku.</p>;
  }

  return (
    <div className="max-h-[min(70vh,640px)] overflow-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500 shadow-sm">
          <tr>
            <th className="px-3 py-3 w-[72px]">Zdjęcie</th>
            <th className="px-3 py-3">SKU</th>
            <th className="px-3 py-3">EAN</th>
            <th className="px-3 py-3 min-w-[140px]">Nazwa</th>
            <th className="px-3 py-3">Partia</th>
            <th className="px-3 py-3">Ważność</th>
            <th className="px-3 py-3">Seryjny</th>
            <th className="px-3 py-3 text-right">Ilość</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const img = (it.product_image_url || "").trim();
            const sku = (it.product_sku || "").trim() || `ID ${it.product_id}`;
            const ean = (it.product_ean || "").trim() || "—";
            const name = (it.product_name || "").trim() || "—";
            const batch = (it.batch_number || "").trim() || "—";
            const serial = (it.serial_number || "").trim() || "—";

            return (
              <tr key={itemRowKey(it)} className="border-b border-slate-100 last:border-0 align-middle">
                <td className="px-3 py-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white">
                    {img ? (
                      <img src={img} alt="" className="max-h-full max-w-full object-contain p-0.5" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-slate-300" strokeWidth={1.5} aria-hidden />
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-900">{sku}</td>
                <td className="px-3 py-3 font-mono text-[11px] text-slate-600">{ean}</td>
                <td className="px-3 py-3 text-slate-800 leading-snug">{name}</td>
                <td className="px-3 py-3 font-mono text-xs text-slate-700">{batch}</td>
                <td className="px-3 py-3">
                  <ExpiryCell iso={it.expiry_date} />
                </td>
                <td className="px-3 py-3 font-mono text-xs text-violet-900">{serial}</td>
                <td className="px-3 py-3 text-right font-mono text-base font-black tabular-nums text-slate-900">
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
