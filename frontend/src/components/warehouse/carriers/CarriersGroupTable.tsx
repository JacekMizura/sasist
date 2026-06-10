import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Archive, MapPin, MoreHorizontal, Pencil, Printer, Wrench } from "lucide-react";
import type { WarehouseCarrierRead } from "../../../api/wmsCarrierApi";
import { patchWmsCarrier } from "../../../api/wmsCarrierApi";
import { openCarrierLabelPrint } from "../../../utils/carrierLabelPrint";
import { CarrierStatusBadge } from "./CarrierStatusBadge";
import { CarrierEditModal } from "./CarrierEditModal";
import { CarrierMoveLocationModal } from "./CarrierMoveLocationModal";
import { CarrierIdentity } from "./CarrierIdentity";
import { CarrierLocationLink } from "./CarrierLocationLink";
import { CarrierContentPreview } from "./CarrierContentPreview";
import type { WarehouseCarrierGroupRead } from "../../../api/wmsCarrierApi";
import {
  cartsSectionClass,
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

function CarrierRowMenu({
  row,
  busy,
  open,
  onToggle,
  onClose,
  onEdit,
  onMove,
  onStatus,
}: {
  row: WarehouseCarrierRead;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onEdit: () => void;
  onMove: () => void;
  onStatus: (status: string) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        className={`${filterToolbarBtnIconSquare} !h-9 !w-9`}
        aria-label="Akcje"
      >
        <MoreHorizontal size={18} />
      </button>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Zamknij menu" onClick={onClose} />
          <div className="absolute right-0 top-10 z-20 min-w-[210px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] hover:bg-slate-50"
              onClick={() => {
                onClose();
                openCarrierLabelPrint(row);
              }}
            >
              <Printer size={16} /> Drukuj etykietę
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] hover:bg-slate-50"
              onClick={() => {
                onClose();
                onEdit();
              }}
            >
              <Pencil size={16} /> Edytuj
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] hover:bg-slate-50"
              onClick={() => {
                onClose();
                onMove();
              }}
            >
              <MapPin size={16} /> Zmień lokalizację
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] hover:bg-slate-50"
              onClick={() => void onStatus("DAMAGED")}
            >
              <Wrench size={16} /> Oznacz jako uszkodzony
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] text-slate-700 hover:bg-slate-50"
              onClick={() => void onStatus("ARCHIVED")}
            >
              <Archive size={16} /> Archiwizuj
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

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
    return emptyHint ? <>{emptyHint}</> : <p className="py-6 text-center text-[15px] text-slate-500">Brak nośników.</p>;
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
      <div className={`${cartsTableWrapClass} hidden md:block`}>
        <table className={cartsTableClass}>
          <thead className={cartsTableHeadClass}>
            <tr>
              <th className={cartsTableHeadCellClass}>Nośnik</th>
              <th className={cartsTableHeadCellClass}>Status</th>
              <th className={cartsTableHeadCellClass}>Lokalizacja</th>
              <th className={cartsTableHeadCellClass}>Zawartość</th>
              <th className={cartsTableHeadCellClass}>Ostatni ruch</th>
              <th className={`${cartsTableHeadCellClass} w-16`}>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const busy = busyId === row.id;
              return (
                <tr key={row.id} className={cartsTableRowClass}>
                  <td className={cartsTableCellClass}>
                    <Link to={detailPath(row.id)} state={navState} className="block min-w-[140px] hover:opacity-90">
                      <CarrierIdentity carrier={row} size="md" />
                    </Link>
                  </td>
                  <td className={cartsTableCellClass}>
                    <CarrierStatusBadge status={row.status} />
                  </td>
                  <td className={cartsTableCellClass}>
                    <CarrierLocationLink
                      tenantId={tenantId}
                      locationCode={row.current_location_code}
                      locationId={row.current_location_id}
                      carrierId={row.id}
                    />
                  </td>
                  <td className={cartsTableCellClass}>
                    <CarrierContentPreview
                      tenantId={tenantId}
                      carrierId={row.id}
                      skuCount={row.sku_count}
                      totalQty={row.total_qty}
                      isMixed={row.is_mixed}
                    />
                  </td>
                  <td className={`${cartsTableCellClass} text-[13px] text-slate-600 whitespace-nowrap`}>
                    {row.updated_at ? new Date(row.updated_at).toLocaleString("pl-PL") : "—"}
                  </td>
                  <td className={cartsTableCellClass}>
                    <CarrierRowMenu
                      row={row}
                      busy={busy}
                      open={menuId === row.id}
                      onToggle={() => setMenuId((id) => (id === row.id ? null : row.id))}
                      onClose={() => setMenuId(null)}
                      onEdit={() => setEditRow(row)}
                      onMove={() => setMoveRow(row)}
                      onStatus={(s) => void setStatus(row, s)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {rows.map((row) => {
          const busy = busyId === row.id;
          return (
            <article key={row.id} className={`${cartsSectionClass} space-y-2 py-2.5`}>
              <div className="flex items-start justify-between gap-2">
                <Link to={detailPath(row.id)} state={navState} className="min-w-0 flex-1">
                  <CarrierIdentity carrier={row} size="lg" />
                </Link>
                <CarrierRowMenu
                  row={row}
                  busy={busy}
                  open={menuId === row.id}
                  onToggle={() => setMenuId((id) => (id === row.id ? null : row.id))}
                  onClose={() => setMenuId(null)}
                  onEdit={() => setEditRow(row)}
                  onMove={() => setMoveRow(row)}
                  onStatus={(s) => void setStatus(row, s)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CarrierStatusBadge status={row.status} />
                <CarrierLocationLink
                  tenantId={tenantId}
                  locationCode={row.current_location_code}
                  locationId={row.current_location_id}
                  carrierId={row.id}
                />
              </div>
              <CarrierContentPreview
                tenantId={tenantId}
                carrierId={row.id}
                skuCount={row.sku_count}
                totalQty={row.total_qty}
                isMixed={row.is_mixed}
              />
              <p className="text-[13px] text-slate-500">
                Ostatni ruch: {row.updated_at ? new Date(row.updated_at).toLocaleString("pl-PL") : "—"}
              </p>
            </article>
          );
        })}
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
