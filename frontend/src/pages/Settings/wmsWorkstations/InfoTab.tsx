import { useEffect, useState } from "react";
import toast from "react-hot-toast";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { updateWorkstation } from "../../../api/wmsWorkstationsApi";
import { useWarehouse } from "../../../context/WarehouseContext";
import type { StationType, WorkstationDetail } from "../../../types/wmsWorkstations";
import { STATION_TYPE_OPTIONS } from "../../../types/wmsWorkstations";
import { WmsSettingsSection } from "../WmsSettingsSection";
import { WMS_WORKSTATIONS_TENANT_ID } from "./tenant";
import { WorkstationTabShell, wsTokens } from "./workstationUi";

type Props = {
  workstationId: number;
  detail: WorkstationDetail;
  onUpdated: (row: WorkstationDetail) => void;
};

export function InfoTab({ workstationId, detail, onUpdated }: Props) {
  const { warehouses } = useWarehouse();
  const [name, setName] = useState(detail.name);
  const [stationType, setStationType] = useState(detail.station_type);
  const [warehouseId, setWarehouseId] = useState(detail.warehouse_id);
  const [description, setDescription] = useState(detail.description ?? "");
  const [isDefault, setIsDefault] = useState(detail.is_default);
  const [isActive, setIsActive] = useState(detail.is_active);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(detail.name);
    setStationType(detail.station_type);
    setWarehouseId(detail.warehouse_id);
    setDescription(detail.description ?? "");
    setIsDefault(detail.is_default);
    setIsActive(detail.is_active);
  }, [detail]);

  const save = async () => {
    setBusy(true);
    try {
      const updated = await updateWorkstation(WMS_WORKSTATIONS_TENANT_ID, workstationId, {
        name: name.trim(),
        station_type: stationType as StationType,
        warehouse_id: warehouseId,
        description: description.trim() || null,
        is_default: isDefault,
        is_active: isActive,
      });
      onUpdated(updated);
      toast.success("Zapisano informacje o stanowisku.");
    } catch (e) {
      toast.error(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkstationTabShell
      intro="Informacje o stanowisku (miejsce pracy)."
      actions={
        <button type="button" className={wsTokens.primaryBtn} disabled={busy} onClick={() => void save()}>
          {busy ? "Zapisywanie…" : "Zapisz"}
        </button>
      }
    >
      <WmsSettingsSection id="ws-info" title="Dane stanowiska">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <label className={wsTokens.fieldLabel}>
            Nazwa
            <input className={wsTokens.input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className={wsTokens.fieldLabel}>
            Typ stanowiska
            <select
              className={wsTokens.select}
              value={stationType}
              onChange={(e) => setStationType(e.target.value)}
            >
              {STATION_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className={wsTokens.fieldLabel}>
            Magazyn
            <select
              className={wsTokens.select}
              value={warehouseId}
              onChange={(e) => setWarehouseId(Number(e.target.value))}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name || `Magazyn #${w.id}`}
                </option>
              ))}
            </select>
          </label>
          <label className={`${wsTokens.fieldLabel} sm:col-span-2`}>
            Opis
            <textarea
              className={wsTokens.input}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="np. Stół pakowania przy bramie 2"
            />
          </label>
          <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              Domyślne dla magazynu
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Aktywne
            </label>
          </div>
        </div>
      </WmsSettingsSection>
    </WorkstationTabShell>
  );
}
