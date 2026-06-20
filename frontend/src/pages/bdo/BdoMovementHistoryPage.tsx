import { useCallback, useEffect, useMemo, useState } from "react";
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
  switch (t) {
    case "purchase":
      return "Zakup (BDO)";
    case "correction":
      return "Korekta";
    case "stock_count":
      return "Spis z natury";
    default:
      return t;
  }
}

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

  const fmtMoney = useMemo(
    () => (n: number | null | undefined) =>
      n == null || !Number.isFinite(n)
        ? "—"
        : new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(n),
    [],
  );

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
            <option value="purchase">Zakupy (BDO)</option>
            <option value="correction">Korekty</option>
            <option value="stock_count">Spisy</option>
          </select>
        </PurchasingFilterField>
      </BdoFilterBar>

      <PurchasingInfoNotice tone="slate">
        Zbiorcza historia operacji BDO: ręczne zakupy materiałów, korekty stanu oraz spisy z natury.{" "}
        <Link to="/warehouse/bdo/purchases" className="font-semibold text-blue-600 hover:underline">
          Rejestracja pojedynczego zakupu (BDO)
        </Link>
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
          description="Zakupy, korekty i spisy z natury pojawią się tutaj po zapisie w module BDO."
        />
      ) : null}

      {rows.length > 0 ? (
        <PurchasingTableSection title="Operacje BDO">
          <table className="w-full min-w-[880px] text-sm">
            <PurchasingTableHeader
              headers={["Data", "Typ", "Materiał / opis", "wm_ref", "Ilość", "Kwota", "Ref / uwagi"]}
              align={["left", "left", "left", "left", "right", "right", "left"]}
            />
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                  <td className={`${purchasingTableTdClass} tabular-nums text-slate-700`}>{fmtDt(r.occurred_at)}</td>
                  <td className={`${purchasingTableTdClass} text-slate-800`}>{typeLabel(r.movement_type)}</td>
                  <td className={`${purchasingTableTdClass} font-medium text-slate-900`}>{r.material_name}</td>
                  <td className={`${purchasingTableTdClass} font-mono text-xs text-slate-600`}>{r.wm_ref ?? "—"}</td>
                  <td className={`${purchasingTableTdClass} text-right tabular-nums text-slate-800`}>
                    {r.qty != null && Number.isFinite(r.qty) ? r.qty.toLocaleString("pl-PL", { maximumFractionDigits: 3 }) : "—"}
                  </td>
                  <td className={`${purchasingTableTdClass} text-right tabular-nums text-slate-800`}>{fmtMoney(r.amount_pln)}</td>
                  <td className={`${purchasingTableTdClass} max-w-xs truncate text-slate-600`} title={r.notes ?? r.reference ?? ""}>
                    {r.reference ? <span className="font-medium">{r.reference}</span> : null}
                    {r.reference && r.notes ? " · " : null}
                    {r.notes ?? ""}
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
