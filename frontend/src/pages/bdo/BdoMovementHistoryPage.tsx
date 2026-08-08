import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { Link } from "react-router-dom";
import { listBdoMovements, type BdoMovement } from "../../api/bdoPackagingApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { AppButton, AppEmptyState } from "../../components/app-shell";
import {
  PurchasingFilterField,
  PurchasingInfoNotice,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingSelectClass,
  purchasingTableTdClass,
} from "../../modules/purchasing/ui";
import { BdoFilterBar } from "./components/BdoFilterBar";
import { useBdoTenant } from "./hooks/useBdoTenant";

function typeLabel(t: string): string {
  switch ((t || "").toUpperCase()) {
    case "PZ":
      return "PZ (przyjęcie)";
    case "RW":
      return "RW (wydanie)";
    case "MM":
      return "MM";
    case "KOREKTA":
    case "ADJUSTMENT":
      return "Korekta";
    default:
      return t || "—";
  }
}

/** BDO historia = projekcja tych samych ruchów co Asortyment → Materiały opakowaniowe → Historia. */
export default function BdoMovementHistoryPage() {
  const { selectedWarehouseId } = useWarehouse();
  const { tenants, tenantId, setTenantId } = useBdoTenant();
  const [rows, setRows] = useState<BdoMovement[]>([]);
  const [filterType, setFilterType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setRows(
        await listBdoMovements(tenantId, {
          warehouseId: selectedWarehouseId ?? undefined,
          movementType: filterType || undefined,
          limit: 800,
        }),
      );
    } catch {
      setErr("Nie udało się wczytać historii ruchów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedWarehouseId, filterType]);

  useEffect(() => {
    void load();
  }, [load]);

  const fmtDt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-5 pb-8">
      <BdoFilterBar
        tenants={tenants}
        tenantId={tenantId}
        onTenantChange={setTenantId}
        actions={
          <AppButton variant="secondary" onClick={() => void load()}>
            Odśwież
          </AppButton>
        }
      >
        <PurchasingFilterField label="Typ">
          <select
            className={purchasingSelectClass}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">Wszystkie</option>
            <option value="PZ">PZ</option>
            <option value="RW">RW</option>
            <option value="MM">MM</option>
            <option value="KOREKTA">Korekta</option>
          </select>
        </PurchasingFilterField>
      </BdoFilterBar>

      <PurchasingInfoNotice tone="slate">
        Historia BDO pochodzi z dokumentów magazynowych (Inventory / StockDocument) dla Carton i
        PackagingMaterial — bez osobnego ledgeru BDO. Katalog i edycja:{" "}
        <Link to="/warehouse-materials/history" className="font-semibold text-blue-600 hover:underline">
          Materiały opakowaniowe → Historia
        </Link>
        .
      </PurchasingInfoNotice>

      {selectedWarehouseId == null ? (
        <PurchasingInfoNotice tone="amber">
          Wybierz magazyn w nagłówku — lista zostanie odfiltrowana do tego magazynu.
        </PurchasingInfoNotice>
      ) : null}

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

      {!loading && rows.length === 0 ? (
        <AppEmptyState
          icon={History}
          title="Brak zarejestrowanych operacji"
          description="Ruchy PZ / RW / MM materiałów opakowaniowych pojawią się tutaj po dokumentach magazynowych."
        />
      ) : null}

      {rows.length > 0 ? (
        <PurchasingTableSection title="Ruchy opakowań (dokumenty magazynowe)">
          <table className="w-full min-w-[880px] text-sm">
            <PurchasingTableHeader
              headers={["Data", "Typ", "Materiał / opis", "wm_ref", "Ilość", "Ref / uwagi"]}
              align={["left", "left", "left", "left", "right", "left"]}
            />
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                  <td className={`${purchasingTableTdClass} tabular-nums text-slate-700`}>{fmtDt(r.occurred_at)}</td>
                  <td className={`${purchasingTableTdClass} text-slate-800`}>{typeLabel(r.movement_type)}</td>
                  <td className={purchasingTableTdClass}>{r.material_name || "—"}</td>
                  <td className={`${purchasingTableTdClass} text-slate-600`}>{r.wm_ref || "—"}</td>
                  <td className={`${purchasingTableTdClass} tabular-nums text-right`}>
                    {r.qty != null ? r.qty : "—"}
                  </td>
                  <td className={`${purchasingTableTdClass} text-slate-600`}>
                    {[r.reference, r.notes].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PurchasingTableSection>
      ) : null}
    </div>
  );
}
