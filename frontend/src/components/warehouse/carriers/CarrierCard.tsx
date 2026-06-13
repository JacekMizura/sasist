import { Link } from "react-router-dom";
import type { WarehouseCarrierRead } from "../../../api/wmsCarrierApi";
import { CarrierBadge } from "./CarrierBadge";
import { CarrierStatusBadge } from "./CarrierStatusBadge";

type Props = {
  row: WarehouseCarrierRead;
  detailPath: (id: number) => string;
  /** Stan przekazywany do react-router (np. ``tenantId`` w WMS). */
  navState?: Record<string, unknown>;
};

export function CarrierCard({ row, detailPath, navState }: Props) {
  const mix = row.is_mixed;
  return (
    <Link
      to={detailPath(row.id)}
      state={navState}
      className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300 hover:shadow-md"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CarrierBadge code={row.code} showMix={mix} className="text-[13px]" />
          <p className="mt-1 font-mono text-[11px] text-slate-500">{row.barcode}</p>
        </div>
        <CarrierStatusBadge status={row.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <div>
          <dt className="font-bold uppercase text-slate-400">Typ</dt>
          <dd className="font-medium text-slate-800">{(row.carrier_group_code || "—").trim()}</dd>
        </div>
        <div>
          <dt className="font-bold uppercase text-slate-400">Magazyn</dt>
          <dd className="truncate text-slate-800">
            {(row.current_warehouse_name || "").trim() ||
              (row.current_warehouse_id != null ? `#${row.current_warehouse_id}` : "—")}
          </dd>
        </div>
        <div>
          <dt className="font-bold uppercase text-slate-400">Lokalizacja</dt>
          <dd className="truncate font-mono text-slate-800">{(row.current_location_code || "").trim() || "—"}</dd>
        </div>
        <div>
          <dt className="font-bold uppercase text-slate-400">SKU</dt>
          <dd className="font-mono font-semibold text-slate-900">{row.sku_count}</dd>
        </div>
        <div>
          <dt className="font-bold uppercase text-slate-400">Sztuki</dt>
          <dd className="font-mono font-semibold text-slate-900">{row.total_qty}</dd>
        </div>
        <div className="col-span-2">
          <dt className="font-bold uppercase text-slate-400">Ostatni ruch</dt>
          <dd className="font-mono text-[11px] text-slate-500">
            {row.updated_at ? new Date(row.updated_at).toLocaleString("pl-PL") : "—"}
          </dd>
        </div>
      </dl>
    </Link>
  );
}
