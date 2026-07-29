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
import { AppOverlayPortal } from "../../../components/overlay";
import { useWarehouse } from "../../../context/WarehouseContext";
import type { StationType, WorkstationListItem } from "../../../types/wmsWorkstations";
import { STATION_TYPE_OPTIONS } from "../../../types/wmsWorkstations";
import { WmsSettingsChrome, WMS_WORKSTATIONS_PATH } from "../WmsSettingsChrome";
import { WmsSettingsLayout } from "../WmsSettingsLayout";
import { WmsSettingsSection } from "../WmsSettingsSection";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import {
  ConnectionDot,
  StationTypeBadge,
  WorkstationEmptyState,
  WorkstationErrorState,
  formatRelativePl,
  wsTokens,
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
        : activeWarehouse?.id ?? warehouses[0]?.id ?? "",
    );
    setModalOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim() || warehouseId === "") {
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
      setModalOpen(false);
      toast.success("Utworzono stanowisko.");
      navigate(`${WMS_WORKSTATIONS_PATH}/${created.id}`);
    } catch (e) {
      toast.error(extractApiErrorMessage(e));
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
    <WmsSettingsChrome
      trail={[{ label: "Stanowiska" }]}
      subtitle="Fizyczne miejsca pracy w magazynie — komputer (Sasist Agent) przypisujesz w szczegółach."
      actions={
        <button type="button" className={wsTokens.primaryBtn} onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Dodaj stanowisko
        </button>
      }
    >
      <WmsSettingsLayout sections={[{ id: "workstations-list", label: "Lista stanowisk" }]}>
      <WmsSettingsSection id="workstations-list" title="Lista stanowisk">
        {warehouses.length > 1 ? (
          <label className="mb-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
            Magazyn
            <select
              className={wsTokens.select}
              style={{ maxWidth: "16rem" }}
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

        {error ? <WorkstationErrorState message={error} onRetry={() => void reload()} /> : null}

        {!loading && !error && rows.length === 0 ? (
          <WorkstationEmptyState
            title="Brak stanowisk"
            description="Dodaj pierwsze miejsce pracy w magazynie — komputer i drukarki podłączysz później."
            action={
              <button type="button" className={wsTokens.primaryBtn} onClick={openCreate}>
                Dodaj stanowisko
              </button>
            }
          />
        ) : (
          <div className="min-w-0">
            <div className="mb-2 hidden gap-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_auto]">
              <span>Nazwa</span>
              <span>Typ</span>
              <span>Magazyn</span>
              <span>Status</span>
              <span>Komputer</span>
              <span>Urządzenia</span>
              <span>Sync</span>
              <span className="text-right">Akcje</span>
            </div>
            {loading ? (
              <p className="py-8 text-sm text-slate-500">Ładowanie…</p>
            ) : (
              rows.map((row) => (
                <div key={row.id} className={wsTokens.listRow}>
                  <div className="min-w-0">
                    <Link
                      to={`${WMS_WORKSTATIONS_PATH}/${row.id}`}
                      className="font-semibold text-slate-900 hover:text-orange-700"
                    >
                      {row.name}
                    </Link>
                    <div className="mt-1 sm:hidden">
                      <StationTypeBadge stationType={row.station_type} label={row.station_type_label} />
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <StationTypeBadge stationType={row.station_type} label={row.station_type_label} />
                  </div>
                  <div className="text-sm text-slate-700">{row.warehouse_name ?? "—"}</div>
                  <div>
                    <ConnectionDot status={row.connection_status} />
                  </div>
                  <div className="truncate text-sm text-slate-700">{row.computer_name ?? "—"}</div>
                  <div className="text-sm text-slate-700">
                    {row.device_count}{" "}
                    {row.device_count === 1
                      ? "urządzenie"
                      : row.device_count >= 2 && row.device_count <= 4
                        ? "urządzenia"
                        : "urządzeń"}
                  </div>
                  <div className="text-sm text-slate-500">{formatRelativePl(row.last_sync_at)}</div>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      title="Edytuj"
                      onClick={() => navigate(`${WMS_WORKSTATIONS_PATH}/${row.id}`)}
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
                </div>
              ))
            )}
          </div>
        )}
      </WmsSettingsSection>
      </WmsSettingsLayout>

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
                  className={wsTokens.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="np. Pakowanie 1"
                />
              </label>
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Typ stanowiska
                <select
                  className={wsTokens.select}
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
                  className={wsTokens.select}
                  value={warehouseId === "" ? "" : String(warehouseId)}
                  onChange={(e) => setWarehouseId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Wybierz…</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name || `Magazyn #${w.id}`}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" className={wsTokens.mutedBtn} onClick={() => setModalOpen(false)}>
                  Anuluj
                </button>
                <button
                  type="button"
                  className={wsTokens.primaryBtn}
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
    </WmsSettingsChrome>
  );
}
