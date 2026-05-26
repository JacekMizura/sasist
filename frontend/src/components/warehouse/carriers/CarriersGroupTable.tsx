import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Archive, MapPin, MoreHorizontal, Pencil, Printer, Wrench } from "lucide-react";
import type { WarehouseCarrierRead } from "../../../api/wmsCarrierApi";
import { patchWmsCarrier } from "../../../api/wmsCarrierApi";
import { openCarrierLabelPrint } from "../../../utils/carrierLabelPrint";
import { CarrierBadge } from "./CarrierBadge";
import { CarrierStatusBadge } from "./CarrierStatusBadge";
import { CarrierEditModal } from "./CarrierEditModal";
import { CarrierMoveLocationModal } from "./CarrierMoveLocationModal";
import type { WarehouseCarrierGroupRead } from "../../../api/wmsCarrierApi";

type Props = {
  tenantId: number;
  rows: WarehouseCarrierRead[];
  groups: WarehouseCarrierGroupRead[];
  detailPath: (id: number) => string;
  navState?: Record<string, unknown>;
  onRowUpdated: (row: WarehouseCarrierRead) => void;
  emptyHint?: ReactNode;
};

export function CarriersGroupTable({
  tenantId,
  rows,
  groups,
  detailPath,
  navState,
  onRowUpdated,
  emptyHint,
}: Props) {
  const [menuId, setMenuId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<WarehouseCarrierRead | null>(null);
  const [moveRow, setMoveRow] = useState<WarehouseCarrierRead | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  if (rows.length === 0) {
    return emptyHint ? <>{emptyHint}</> : <p className="py-6 text-center text-sm text-slate-500">Brak nośników.</p>;
  }

  const setStatus = async (row: WarehouseCarrierRead, status: string) => {
    setBusyId(row.id);
    setMenuId(null);
    try {
      const updated = await patchWmsCarrier(tenantId, row.id, { status });
      onRowUpdated(updated);
    } catch {
      window.alert("Nie udało się zmienić statusu.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Kod</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Lokalizacja</th>
              <th className="px-3 py-2.5 text-right">SKU</th>
              <th className="px-3 py-2.5 text-right">Sztuki</th>
              <th className="px-3 py-2.5">Mix</th>
              <th className="px-3 py-2.5">Ostatni ruch</th>
              <th className="px-3 py-2.5 w-28">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const busy = busyId === row.id;
              return (
                <tr key={row.id} className="bg-white hover:bg-amber-50/30">
                  <td className="px-3 py-2.5">
                    <Link to={detailPath(row.id)} state={navState} className="block min-w-[120px]">
                      <CarrierBadge code={row.code} showMix={row.is_mixed} className="text-[12px]" />
                      <span className="mt-0.5 block font-mono text-[10px] text-slate-500">{row.barcode}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <CarrierStatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-800">
                    {(row.current_location_code || "").trim() || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">{row.sku_count}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums">{row.total_qty}</td>
                  <td className="px-3 py-2.5 text-xs font-bold text-slate-700">{row.is_mixed ? "Tak" : "Nie"}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                    {row.updated_at ? new Date(row.updated_at).toLocaleString("pl-PL") : "—"}
                  </td>
                  <td className="relative px-2 py-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setMenuId((id) => (id === row.id ? null : row.id))}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      aria-label="Akcje"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {menuId === row.id ? (
                      <>
                        <button
                          type="button"
                          className="fixed inset-0 z-10 cursor-default"
                          aria-label="Zamknij menu"
                          onClick={() => setMenuId(null)}
                        />
                        <div className="absolute right-2 top-11 z-20 min-w-[200px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => {
                              setMenuId(null);
                              openCarrierLabelPrint(row);
                            }}
                          >
                            <Printer size={16} /> Drukuj etykietę
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => {
                              setMenuId(null);
                              setEditRow(row);
                            }}
                          >
                            <Pencil size={16} /> Edytuj
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => {
                              setMenuId(null);
                              setMoveRow(row);
                            }}
                          >
                            <MapPin size={16} /> Zmień lokalizację
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                            onClick={() => void setStatus(row, "DAMAGED")}
                          >
                            <Wrench size={16} /> Oznacz jako uszkodzony
                          </button>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                            onClick={() => void setStatus(row, "ARCHIVED")}
                          >
                            <Archive size={16} /> Archiwizuj
                          </button>
                        </div>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CarrierEditModal
        tenantId={tenantId}
        open={editRow != null}
        carrier={editRow}
        groups={groups}
        onClose={() => setEditRow(null)}
        onSaved={onRowUpdated}
      />
      <CarrierMoveLocationModal
        tenantId={tenantId}
        open={moveRow != null}
        carrier={moveRow}
        onClose={() => setMoveRow(null)}
        onSaved={onRowUpdated}
      />
    </>
  );
}
