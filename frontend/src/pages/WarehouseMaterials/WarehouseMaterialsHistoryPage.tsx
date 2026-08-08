import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History } from "lucide-react";

import {
  listWarehouseMaterialsMovements,
  type PackagingMovementDto,
} from "../../api/warehouseMaterialsMovementsApi";
import { AppButton, AppEmptyState } from "../../components/app-shell";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  PurchasingFilterField,
  PurchasingInfoNotice,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingSelectClass,
  purchasingTableTdClass,
} from "../../modules/purchasing/ui";

function typeLabel(t: string): string {
  switch ((t || "").toUpperCase()) {
    case "PZ":
      return "PZ (przyjęcie)";
    case "RW":
      return "RW (wydanie)";
    case "MM":
      return "MM (przesunięcie)";
    case "KOREKTA":
    case "ADJUSTMENT":
      return "Korekta";
    case "WZ":
      return "WZ";
    default:
      return t || "—";
  }
}

/**
 * Historia ruchów opakowań — projekcja StockDocument / StockOperation (Inventory SSOT).
 * Bez osobnego ledgeru BDO.
 */
export default function WarehouseMaterialsHistoryPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;
  const [rows, setRows] = useState<PackagingMovementDto[]>([]);
  const [filterType, setFilterType] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      setRows(
        await listWarehouseMaterialsMovements(tenantId, warehouseId, {
          movementType: filterType || undefined,
          limit: 300,
        }),
      );
    } catch {
      setErr("Nie udało się wczytać historii ruchów materiałów opakowaniowych.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId, filterType]);

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

  const fmtQty = (n: number) =>
    new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 3 }).format(n || 0);

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-end gap-3">
        <PurchasingFilterField label="Typ dokumentu">
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
        <AppButton variant="secondary" onClick={() => void load()}>
          Odśwież
        </AppButton>
      </div>

      <PurchasingInfoNotice tone="slate">
        Ruchy wynikają z dokumentów magazynowych (PZ / RW / MM) powiązanych z Carton i
        PackagingMaterial przez Inventory. Raport BDO korzysta z tych samych danych — bez osobnego
        rejestru zakupów.{" "}
        <Link to="/warehouse/bdo/monthly-report" className="font-semibold text-blue-600 hover:underline">
          Raport miesięczny BDO
        </Link>
      </PurchasingInfoNotice>

      {warehouseId == null ? (
        <PurchasingInfoNotice tone="amber">Wybierz magazyn w nagłówku.</PurchasingInfoNotice>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

      {!loading && rows.length === 0 && warehouseId != null ? (
        <AppEmptyState
          icon={History}
          title="Brak ruchów"
          description="Historia pojawi się po przyjęciu PZ, wydaniu RW (np. pakowanie) lub MM dla materiałów opakowaniowych."
        />
      ) : null}

      {rows.length > 0 ? (
        <PurchasingTableSection title="Ruchy magazynowe">
          <table className="w-full min-w-[960px] text-sm">
            <PurchasingTableHeader
              headers={["Data", "Typ", "Dokument", "Materiał", "SKU", "Ilość", "Ref"]}
              align={["left", "left", "left", "left", "left", "right", "left"]}
            />
            <tbody>
              {rows.map((r) => {
                const editPath =
                  r.wm_kind === "carton" && r.wm_id
                    ? `/warehouse-materials/cartons/${r.wm_id}`
                    : r.wm_kind === "packaging" && r.wm_id
                      ? `/warehouse-materials/packaging/${r.wm_id}`
                      : null;
                return (
                  <tr key={r.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                    <td className={`${purchasingTableTdClass} tabular-nums text-slate-700`}>
                      {fmtDt(r.occurred_at)}
                    </td>
                    <td className={purchasingTableTdClass}>{typeLabel(r.movement_type)}</td>
                    <td className={`${purchasingTableTdClass} text-slate-700`}>
                      {r.document_number || r.document_type || "—"}
                    </td>
                    <td className={purchasingTableTdClass}>
                      {editPath ? (
                        <Link to={editPath} className="font-medium text-blue-700 hover:underline">
                          {r.material_name}
                        </Link>
                      ) : (
                        r.material_name
                      )}
                    </td>
                    <td className={`${purchasingTableTdClass} text-slate-600`}>{r.sku || "—"}</td>
                    <td className={`${purchasingTableTdClass} tabular-nums text-right`}>{fmtQty(r.qty)}</td>
                    <td className={`${purchasingTableTdClass} text-slate-600`}>{r.reference || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </PurchasingTableSection>
      ) : null}
    </div>
  );
}
