import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Leaf } from "lucide-react";

import { getCartons, type CartonDto } from "../../api/cartonsApi";
import { getPackagingMaterials, type PackagingMaterialDto } from "../../api/packagingMaterialsApi";
import { AppEmptyState } from "../../components/app-shell";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  PurchasingInfoNotice,
  PurchasingTableHeader,
  PurchasingTableSection,
  purchasingTableTdClass,
} from "../../modules/purchasing/ui";
import {
  ppwrFunctionLabel,
  ppwrStatusLabel,
} from "../../modules/warehouseMaterials/ppwrLabels";

type PpwrRow = {
  key: string;
  kind: "carton" | "packaging";
  id: string;
  name: string;
  ppwr_function: string | null;
  ppwr_format: string | null;
  recyclable_pct: number | null;
  recycled_content_pct: number | null;
  is_reusable: boolean | null;
  ppwr_status: string;
  editPath: string;
};

function fmtPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v}%`;
}

/**
 * PPWR tab — projection of Carton / PackagingMaterial (same catalog, no new rows).
 */
export default function WarehouseMaterialsPpwrPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;
  const [rows, setRows] = useState<PpwrRow[]>([]);
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
      const [cartons, materials] = await Promise.all([
        getCartons({ tenant_id: tenantId, warehouse_id: warehouseId }),
        getPackagingMaterials({ tenant_id: tenantId, warehouse_id: warehouseId }),
      ]);
      const mapped: PpwrRow[] = [
        ...(cartons as CartonDto[]).map((c) => ({
          key: `carton:${c.id}`,
          kind: "carton" as const,
          id: c.id,
          name: c.name,
          ppwr_function: c.ppwr_function ?? null,
          ppwr_format: c.ppwr_format ?? null,
          recyclable_pct: c.recyclable_pct ?? null,
          recycled_content_pct: c.recycled_content_pct ?? null,
          is_reusable: c.is_reusable ?? null,
          ppwr_status: c.ppwr_status || "NOT_ASSESSED",
          editPath: `/warehouse-materials/cartons/${c.id}`,
        })),
        ...(materials as PackagingMaterialDto[]).map((m) => ({
          key: `packaging:${m.id}`,
          kind: "packaging" as const,
          id: m.id,
          name: m.name,
          ppwr_function: m.ppwr_function ?? null,
          ppwr_format: m.ppwr_format ?? null,
          recyclable_pct: m.recyclable_pct ?? null,
          recycled_content_pct: m.recycled_content_pct ?? null,
          is_reusable: m.is_reusable ?? null,
          ppwr_status: m.ppwr_status || "NOT_ASSESSED",
          editPath: `/warehouse-materials/packaging/${m.id}`,
        })),
      ];
      mapped.sort((a, b) => a.name.localeCompare(b.name, "pl"));
      setRows(mapped);
    } catch {
      setErr("Nie udało się wczytać materiałów do widoku PPWR.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5 pb-8">
      <PurchasingInfoNotice tone="slate">
        Widok projekcji PPWR dla kartonów wysyłkowych i materiałów pakowych. Edycja na karcie materiału
        (zakładka PPWR). Opakowanie produktu (SALES) jest na karcie produktu — nie tutaj.
      </PurchasingInfoNotice>

      {warehouseId == null ? (
        <PurchasingInfoNotice tone="amber">Wybierz magazyn w nagłówku.</PurchasingInfoNotice>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

      {!loading && rows.length === 0 && warehouseId != null ? (
        <AppEmptyState
          icon={Leaf}
          title="Brak materiałów opakowaniowych"
          description="Dodaj kartony lub materiały pakowe w sąsiednich zakładkach."
        />
      ) : null}

      {rows.length > 0 ? (
        <PurchasingTableSection title="PPWR — Carton + PackagingMaterial">
          <table className="w-full min-w-[1080px] text-sm">
            <PurchasingTableHeader
              headers={[
                "Nazwa",
                "Typ",
                "Funkcja PPWR",
                "Format",
                "Recyklingowalność",
                "Recycled content",
                "Reusable",
                "Status",
              ]}
              align={["left", "left", "left", "left", "right", "right", "left", "left"]}
            />
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-slate-100 transition-colors hover:bg-slate-50/80">
                  <td className={purchasingTableTdClass}>
                    <Link to={r.editPath} className="font-medium text-blue-700 hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className={`${purchasingTableTdClass} text-slate-600`}>
                    {r.kind === "carton" ? "Karton" : "Materiał pakowy"}
                  </td>
                  <td className={purchasingTableTdClass}>{ppwrFunctionLabel(r.ppwr_function)}</td>
                  <td className={`${purchasingTableTdClass} text-slate-600`}>{r.ppwr_format || "—"}</td>
                  <td className={`${purchasingTableTdClass} tabular-nums text-right`}>
                    {fmtPct(r.recyclable_pct)}
                  </td>
                  <td className={`${purchasingTableTdClass} tabular-nums text-right`}>
                    {fmtPct(r.recycled_content_pct)}
                  </td>
                  <td className={purchasingTableTdClass}>
                    {r.is_reusable == null ? "—" : r.is_reusable ? "Tak" : "Nie"}
                  </td>
                  <td className={`${purchasingTableTdClass} text-slate-700`}>
                    {ppwrStatusLabel(r.ppwr_status)}
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
