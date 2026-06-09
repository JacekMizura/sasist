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
import {
  cartsTableCellClass,
  cartsTableClass,
  cartsTableHeadCellClass,
  cartsTableHeadClass,
  cartsTableRowClass,
  cartsTableWrapClass,
} from "../../../modules/carts/cartsModuleTokens";
import { filterToolbarBtnIconSquare } from "../../../components/filters/filterUiTokens";

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
      <div className={cartsTableWrapClass}>
        <table className={cartsTableClass}>
          <thead className={cartsTableHeadClass}>
            <tr>
              <th className={cartsTableHeadCellClass}>Kod</th>
              <th className={cartsTableHeadCellClass}>Status</th>
              <th className={cartsTableHeadCellClass}>Lokalizacja</th>
              <th className={`${cartsTableHeadCellClass} text-right`}>SKU</th>
              <th className={`${cartsTableHeadCellClass} text-right`}>Sztuki</th>
              <th className={cartsTableHeadCellClass}>Mix</th>
              <th className={cartsTableHeadCellClass}>Ostatni ruch</th>
              <th className={`${cartsTableHeadCellClass} w-24`}>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const busy = busyId === row.id;
              return (
                <tr key={row.id} className={cartsTableRowClass}>
                  <td className={cartsTableCellClass}>
                    <Link to={detailPath(row.id)} state={navState} className="block min-w-[120px]">
                      <CarrierBadge code={row.code} showMix={row.is_mixed} />
                      <span className="mt-0.5 block font-mono text-[10px] text-slate-500">{row.barcode}</span>
                    </Link>
                  </td>
                  <td className={cartsTableCellClass}>
                    <CarrierStatusBadge status={row.status} />
                  </td>
                  <td className={`${cartsTableCellClass} font-mono text-[12px]`}>
                    {(row.current_location_code || "").trim() || "—"}
                  </td>
                  <td className={`${cartsTableCellClass} text-right font-mono tabular-nums`}>{row.sku_count}</td>
                  <td className={`${cartsTableCellClass} text-right font-mono tabular-nums`}>{row.total_qty}</td>
                  <td className={`${cartsTableCellClass} text-[12px] text-slate-700`}>{row.is_mixed ? "Tak" : "Nie"}</td>
                  <td className={`${cartsTableCellClass} font-mono text-[11px] text-slate-500 whitespace-nowrap`}>
                    {row.updated_at ? new Date(row.updated_at).toLocaleString("pl-PL") : "—"}
                  </td>
                  <td className={`relative ${cartsTableCellClass}`}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setMenuId((id) => (id === row.id ? null : row.id))}
                      className={filterToolbarBtnIconSquare}
                      aria-label="Akcje"
                    >
                      <MoreHorizontal size={16} />
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
