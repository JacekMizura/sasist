import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Archive, Eye, MapPin, MoreHorizontal, Pencil, Printer, Wrench } from "lucide-react";

import type { WarehouseCarrierGroupRead, WarehouseCarrierRead } from "../../../api/wmsCarrierApi";
import { patchWmsCarrier } from "../../../api/wmsCarrierApi";
import { PROPORTIONAL_TABLE_SYSTEM_WIDTHS } from "../../listPage/proportionalTableColumns";
import { useProportionalTableColumns } from "../../listPage/useProportionalTableColumns";
import {
  OperationalActionButton,
  OperationalActionColumn,
} from "../../operational";
import { openCarrierLabelPrint } from "../../../utils/carrierLabelPrint";
import { CarrierStatusBadge } from "./CarrierStatusBadge";
import { CarrierEditModal } from "./CarrierEditModal";
import { CarrierMoveLocationModal } from "./CarrierMoveLocationModal";
import { CarrierIdentity } from "./CarrierIdentity";
import { CarrierLocationLink } from "./CarrierLocationLink";
import { CarrierContentPreview } from "./CarrierContentPreview";
import {
  carriersListActionsCellClass,
  carriersListActionsThClass,
  carriersListNameCellClass,
  carriersListNameThClass,
  carriersListRowClass,
  carriersListRowInnerClass,
  carriersListTableClass,
  carriersListTdClass,
  carriersListThClass,
  carriersListThRightClass,
} from "./carriersListTableTokens";

const DYNAMIC_COLUMNS = ["status", "warehouse", "location", "content", "last_move"] as const;
const TABLE_LAYOUT = { ...PROPORTIONAL_TABLE_SYSTEM_WIDTHS, checkboxPx: 0, logoPx: 0, actionsPx: 120 };

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
  onMove,
  onStatus,
}: {
  row: WarehouseCarrierRead;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onMove: () => void;
  onStatus: (status: string) => void;
}) {
  return (
    <div className="relative">
      <OperationalActionButton
        disabled={busy}
        onClick={onToggle}
        title="Więcej akcji"
        aria-label="Więcej akcji"
      >
        <MoreHorizontal strokeWidth={2} aria-hidden />
      </OperationalActionButton>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Zamknij menu" onClick={onClose} />
          <div className="absolute right-0 top-10 z-20 min-w-[210px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                onClose();
                openCarrierLabelPrint(row);
              }}
            >
              <Printer size={16} aria-hidden /> Drukuj etykietę
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
              onClick={() => {
                onClose();
                onMove();
              }}
            >
              <MapPin size={16} aria-hidden /> Zmień lokalizację
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
              onClick={() => void onStatus("DAMAGED")}
            >
              <Wrench size={16} aria-hidden /> Oznacz jako uszkodzony
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => void onStatus("ARCHIVED")}
            >
              <Archive size={16} aria-hidden /> Archiwizuj
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function DynamicCell({
  row,
  columnId,
  tenantId,
}: {
  row: WarehouseCarrierRead;
  columnId: (typeof DYNAMIC_COLUMNS)[number];
  tenantId: number;
}) {
  const inner = `${carriersListRowInnerClass} min-w-0`;
  switch (columnId) {
    case "status":
      return (
        <div className={inner}>
          <CarrierStatusBadge status={row.status} />
        </div>
      );
    case "warehouse":
      return (
        <div className={inner}>
          <span className="block truncate text-slate-800">
            {(row.current_warehouse_name || "").trim() ||
              (row.current_warehouse_id != null ? `#${row.current_warehouse_id}` : "—")}
          </span>
        </div>
      );
    case "location":
      return (
        <div className={inner}>
          <CarrierLocationLink
            tenantId={tenantId}
            locationCode={row.current_location_code}
            locationId={row.current_location_id}
            carrierId={row.id}
          />
        </div>
      );
    case "content":
      return (
        <div className={inner}>
          <CarrierContentPreview
            tenantId={tenantId}
            carrierId={row.id}
            skuCount={row.sku_count}
            totalQty={row.total_qty}
            isMixed={row.is_mixed}
          />
        </div>
      );
    case "last_move":
      return (
        <div className={`${inner} justify-end tabular-nums text-slate-600`}>
          {row.updated_at ? new Date(row.updated_at).toLocaleString("pl-PL") : "—"}
        </div>
      );
    default:
      return <div className={inner}>—</div>;
  }
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
  const navigate = useNavigate();
  const [menuId, setMenuId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<WarehouseCarrierRead | null>(null);
  const [moveRow, setMoveRow] = useState<WarehouseCarrierRead | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { containerRef, widths, contentMinWidthPx, needsHorizontalScroll } = useProportionalTableColumns(
    DYNAMIC_COLUMNS.length,
    TABLE_LAYOUT,
  );

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

  const scrollClass = needsHorizontalScroll ? "overflow-x-auto" : "overflow-x-hidden";
  const tableStyle = needsHorizontalScroll ? { width: contentMinWidthPx } : undefined;

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
        <div ref={containerRef} className={`min-w-0 ${scrollClass}`}>
          <table className={carriersListTableClass} style={tableStyle}>
            <colgroup>
              <col style={{ width: widths.name }} />
              {DYNAMIC_COLUMNS.map((colId) => (
                <col key={colId} style={{ width: widths.dynamic > 0 ? widths.dynamic : undefined }} />
              ))}
              <col style={{ width: widths.actions }} />
            </colgroup>
            <thead>
              <tr>
                <th className={carriersListNameThClass}>Nośnik</th>
                <th className={carriersListThClass}>Status</th>
                <th className={carriersListThClass}>Magazyn</th>
                <th className={carriersListThClass}>Lokalizacja</th>
                <th className={carriersListThClass}>Zawartość</th>
                <th className={carriersListThRightClass}>Ostatni ruch</th>
                <th className={carriersListActionsThClass}>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const busy = busyId === row.id;
                return (
                  <tr key={row.id} className={carriersListRowClass}>
                    <td className={carriersListNameCellClass}>
                      <div className={`${carriersListRowInnerClass} min-w-0 py-2`}>
                        <Link to={detailPath(row.id)} state={navState} className="block min-w-0 hover:opacity-90">
                          <CarrierIdentity carrier={row} size="md" />
                        </Link>
                      </div>
                    </td>
                    {DYNAMIC_COLUMNS.map((colId) => (
                      <td key={colId} className={carriersListTdClass}>
                        <DynamicCell row={row} columnId={colId} tenantId={tenantId} />
                      </td>
                    ))}
                    <td className={carriersListActionsCellClass} onClick={(e) => e.stopPropagation()}>
                      <OperationalActionColumn
                        aria-label="Akcje nośnika"
                        slots={[
                          <OperationalActionButton
                            key="view"
                            onClick={() => navigate(detailPath(row.id), { state: navState })}
                            title="Podgląd"
                            aria-label="Podgląd nośnika"
                          >
                            <Eye className="text-slate-600" strokeWidth={2} aria-hidden />
                          </OperationalActionButton>,
                          <OperationalActionButton
                            key="edit"
                            onClick={() => setEditRow(row)}
                            title="Edytuj"
                            aria-label="Edytuj nośnik"
                          >
                            <Pencil className="text-slate-600" strokeWidth={2} aria-hidden />
                          </OperationalActionButton>,
                          <CarrierRowMenu
                            key="more"
                            row={row}
                            busy={busy}
                            open={menuId === row.id}
                            onToggle={() => setMenuId((id) => (id === row.id ? null : row.id))}
                            onClose={() => setMenuId(null)}
                            onMove={() => setMoveRow(row)}
                            onStatus={(s) => void setStatus(row, s)}
                          />,
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {rows.map((row) => {
          const busy = busyId === row.id;
          return (
            <article key={row.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <Link to={detailPath(row.id)} state={navState} className="min-w-0 flex-1">
                  <CarrierIdentity carrier={row} size="lg" />
                </Link>
                <OperationalActionColumn
                  aria-label="Akcje nośnika"
                  slots={[
                    <OperationalActionButton key="edit" onClick={() => setEditRow(row)} title="Edytuj" aria-label="Edytuj">
                      <Pencil strokeWidth={2} aria-hidden />
                    </OperationalActionButton>,
                    <CarrierRowMenu
                      key="more"
                      row={row}
                      busy={busy}
                      open={menuId === row.id}
                      onToggle={() => setMenuId((id) => (id === row.id ? null : row.id))}
                      onClose={() => setMenuId(null)}
                      onMove={() => setMoveRow(row)}
                      onStatus={(s) => void setStatus(row, s)}
                    />,
                  ]}
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
              <p className="text-sm text-slate-500">
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
