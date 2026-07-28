import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import {
  createWorkstation,
  deleteWorkstation,
  fetchWorkstations,
} from "../../../api/wmsWorkstationsApi";
import PageLayout from "../../../components/layout/PageLayout";
import { PageHeader } from "../../../components/layout/PageHeader";
import { AppOverlayPortal } from "../../../components/overlay";
import { useWarehouse } from "../../../context/WarehouseContext";
import { brandPrimaryButtonClass } from "../../../design-system/brandUi";
import type { StationType, WorkstationListItem } from "../../../types/wmsWorkstations";
import { STATION_TYPE_OPTIONS } from "../../../types/wmsWorkstations";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import {
  ConnectionDot,
  StationTypeBadge,
  WorkstationEmptyState,
  WorkstationErrorState,
  WorkstationsBreadcrumb,
  formatRelativePl,
} from "./workstationUi";

export default function WmsWorkstationsListPage() {
  const navigate = useNavigate();
  const { warehouses, warehouse: activeWarehouse, showWarehouseSelector } = useWarehouse();
  const [rows, setRows] = useState<WorkstationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterWarehouseId, setFilterWarehouseId] = useState<number | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [stationType, setStationType] = useState<StationType>("packing");
  const [warehouseId, setWarehouseId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (showWarehouseSelector && activeWarehouse?.id) {
      setFilterWarehouseId(activeWarehouse.id);
    }
  }, [showWarehouseSelector, activeWarehouse?.id]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const wh = filterWarehouseId === "all" ? null : filterWarehouseId;
      setRows(await fetchWorkstations(WMS_WORKSTATIONS_TENANT_ID, wh));
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 401) {
        setError("Brak uprawnień do listy stanowisk.");
      } else {
        setError(extractApiErrorMessage(e, "Nie udało się wczytać stanowisk."));
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filterWarehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openCreate = () => {
    if (warehouses.length === 0) {
      toast.error("Brak magazynów — najpierw skonfiguruj magazyn w ustawieniach.");
      return;
    }
    setName("");
    setStationType("packing");
    setWarehouseId(
      filterWarehouseId !== "all"
        ? filterWarehouseId
        : (activeWarehouse?.id ?? warehouses[0]?.id ?? ""),
    );
    setModalOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim() || !warehouseId) {
      toast.error("Podaj nazwę i magazyn.");
      return;
    }
    setBusy(true);
    try {
      const created = await createWorkstation(WMS_WORKSTATIONS_TENANT_ID, {
        name: name.trim(),
        warehouse_id: Number(warehouseId),
        station_type: stationType,
      });
      toast.success("Dodano stanowisko — wygeneruj kod połączenia z Agentem.");
      setModalOpen(false);
      navigate(`/settings/wms/workstations/${created.id}`);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się dodać stanowiska."));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (row: WorkstationListItem) => {
    if (!window.confirm(`Usunąć stanowisko „${row.name}”?`)) return;
    try {
      await deleteWorkstation(WMS_WORKSTATIONS_TENANT_ID, row.id);
      toast.success("Usunięto stanowisko.");
      void reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e));
    }
  };

  return (
    <PageLayout>
      <WorkstationsBreadcrumb />
      <PageHeader
        title="Stanowiska"
        actions={
          <button type="button" className={brandPrimaryButtonClass} onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Dodaj stanowisko
          </button>
        }
      />
      <p className="mb-4 text-sm text-slate-600">
        Stanowisko to fizyczne miejsce pracy w magazynie. Komputer (Sasist Agent) przypisujesz w
        szczegółach stanowiska.
      </p>

      {warehouses.length > 1 ? (
        <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
          Magazyn
          <select
            className="rounded-lg border border-slate-200 px-2 py-1.5"
            value={filterWarehouseId === "all" ? "all" : String(filterWarehouseId)}
            onChange={(e) =>
              setFilterWarehouseId(e.target.value === "all" ? "all" : Number(e.target.value))
            }
          >
            <option value="all">Wszystkie</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name || `Magazyn #${w.id}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {error ? (
        <div className="mb-3">
          <WorkstationErrorState message={error} onRetry={() => void reload()} />
        </div>
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <WorkstationEmptyState
          title="Brak stanowisk"
          description="Dodaj pierwsze miejsce pracy w magazynie — komputer i drukarki podłączysz później."
          action={
            <button type="button" className={brandPrimaryButtonClass} onClick={openCreate}>
              Dodaj stanowisko
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nazwa</th>
                <th className="px-4 py-3 font-medium">Typ</th>
                <th className="px-4 py-3 font-medium">Magazyn</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Przypisany komp.</th>
                <th className="px-4 py-3 font-medium">Urządzenia</th>
                <th className="px-4 py-3 font-medium">Sync</th>
                <th className="px-4 py-3 font-medium">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Ładowanie…
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        to={`/settings/wms/workstations/${row.id}`}
                        className="hover:text-orange-600"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StationTypeBadge
                        stationType={row.station_type}
                        label={row.station_type_label}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.warehouse_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <ConnectionDot status={row.connection_status} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.computer_name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.device_count}{" "}
                      {row.device_count === 1
                        ? "urządzenie"
                        : row.device_count >= 2 && row.device_count <= 4
                          ? "urządzenia"
                          : "urządzeń"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatRelativePl(row.last_sync_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-orange-600"
                          title="Edytuj"
                          onClick={() => navigate(`/settings/wms/workstations/${row.id}`)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          title="Usuń"
                          onClick={() => void handleDelete(row)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <AppOverlayPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-slate-900">Dodaj stanowisko</h2>
              <p className="mt-1 text-sm text-slate-500">
                Miejsce pracy w magazynie — komputer podłączysz później.
              </p>
              <label className="mt-4 block text-sm font-medium text-slate-700">
                Nazwa
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="np. Pakowanie 1"
                />
              </label>
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Typ stanowiska
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={stationType}
                  onChange={(e) => setStationType(e.target.value as StationType)}
                >
                  {STATION_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Magazyn
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name || `Magazyn #${w.id}`}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                  onClick={() => setModalOpen(false)}
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  className={brandPrimaryButtonClass}
                  disabled={busy}
                  onClick={() => void handleCreate()}
                >
                  {busy ? "Zapisywanie…" : "Utwórz"}
                </button>
              </div>
            </div>
          </div>
        </AppOverlayPortal>
      ) : null}
    </PageLayout>
  );
}
