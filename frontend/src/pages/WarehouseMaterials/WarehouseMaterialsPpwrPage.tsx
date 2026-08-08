import { useCallback, useEffect, useMemo, useState } from "react";
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

type PpwrRow = {
  key: string;
  kind: "carton" | "packaging";
  id: string;
  name: string;
  sku: string | null;
  include_in_bdo: boolean;
  plastic_kg: number;
  paper_kg: number;
  wood_kg: number;
  glass_kg: number;
  metal_kg: number;
  editPath: string;
  readiness: "ready_stub" | "needs_masses" | "inactive";
};

function readinessOf(r: {
  is_active: boolean;
  include_in_bdo: boolean;
  plastic_kg: number;
  paper_kg: number;
  wood_kg: number;
  glass_kg: number;
  metal_kg: number;
}): PpwrRow["readiness"] {
  if (!r.is_active) return "inactive";
  const mass =
    (r.plastic_kg || 0) + (r.paper_kg || 0) + (r.wood_kg || 0) + (r.glass_kg || 0) + (r.metal_kg || 0);
  if (mass > 1e-9 || r.include_in_bdo) return "ready_stub";
  return "needs_masses";
}

function readinessLabel(v: PpwrRow["readiness"]): string {
  switch (v) {
    case "ready_stub":
      return "Dane bazowe (BDO kg) — PPWR w przygotowaniu";
    case "needs_masses":
      return "Uzupełnij masy / flagę BDO na karcie materiału";
    case "inactive":
      return "Nieaktywny";
    default:
      return v;
  }
}

/**
 * PPWR tab — projection of Carton / PackagingMaterial (same catalog).
 * Full PPWR fields / composition come in a later stage; this prepares the IA surface.
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
        ...(cartons as CartonDto[]).map((c) => {
          const base = {
            is_active: !!c.is_active,
            include_in_bdo: !!c.include_in_bdo,
            plastic_kg: Number(c.plastic_kg_per_unit || 0),
            paper_kg: Number(c.paper_kg_per_unit || 0),
            wood_kg: Number(c.wood_kg_per_unit || 0),
            glass_kg: Number(c.glass_kg_per_unit || 0),
            metal_kg: Number(c.metal_kg_per_unit || 0),
          };
          return {
            key: `carton:${c.id}`,
            kind: "carton" as const,
            id: c.id,
            name: c.name,
            sku: c.sku ?? null,
            include_in_bdo: base.include_in_bdo,
            plastic_kg: base.plastic_kg,
            paper_kg: base.paper_kg,
            wood_kg: base.wood_kg,
            glass_kg: base.glass_kg,
            metal_kg: base.metal_kg,
            editPath: `/warehouse-materials/cartons/${c.id}`,
            readiness: readinessOf(base),
          };
        }),
        ...(materials as PackagingMaterialDto[]).map((m) => {
          const base = {
            is_active: !!m.is_active,
            include_in_bdo: !!m.include_in_bdo,
            plastic_kg: Number(m.plastic_kg_per_unit || 0),
            paper_kg: Number(m.paper_kg_per_unit || 0),
            wood_kg: Number(m.wood_kg_per_unit || 0),
            glass_kg: Number(m.glass_kg_per_unit || 0),
            metal_kg: Number(m.metal_kg_per_unit || 0),
          };
          return {
            key: `packaging:${m.id}`,
            kind: "packaging" as const,
            id: m.id,
            name: m.name,
            sku: m.sku ?? null,
            include_in_bdo: base.include_in_bdo,
            plastic_kg: base.plastic_kg,
            paper_kg: base.paper_kg,
            wood_kg: base.wood_kg,
            glass_kg: base.glass_kg,
            metal_kg: base.metal_kg,
            editPath: `/warehouse-materials/packaging/${m.id}`,
            readiness: readinessOf(base),
          };
        }),
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

  const fmtKg = useMemo(
    () => (n: number) =>
      new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(n || 0),
    [],
  );

  return (
    <div className="space-y-5 pb-8">
      <PurchasingInfoNotice tone="slate">
        PPWR to wymagania dotyczące opakowania (Carton / PackagingMaterial) — nie osobny katalog.
        Na tym etapie widok pokazuje te same materiały i masy BDO jako bazę pod przyszłe pola
        (recyklingowalność, materiał z recyklingu, wielokrotne użycie, pusta przestrzeń). Edycja
        odbywa się na karcie materiału (zakładka BDO).
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
        <PurchasingTableSection title="Materiały — gotowość pod PPWR">
          <table className="w-full min-w-[960px] text-sm">
            <PurchasingTableHeader
              headers={[
                "Materiał",
                "Typ",
                "SKU",
                "BDO",
                "Tworzywo kg",
                "Papier kg",
                "Inne kg",
                "Status PPWR",
              ]}
              align={["left", "left", "left", "left", "right", "right", "right", "left"]}
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
                  <td className={`${purchasingTableTdClass} text-slate-600`}>{r.sku || "—"}</td>
                  <td className={purchasingTableTdClass}>{r.include_in_bdo ? "Tak" : "Nie"}</td>
                  <td className={`${purchasingTableTdClass} tabular-nums text-right`}>{fmtKg(r.plastic_kg)}</td>
                  <td className={`${purchasingTableTdClass} tabular-nums text-right`}>{fmtKg(r.paper_kg)}</td>
                  <td className={`${purchasingTableTdClass} tabular-nums text-right`}>
                    {fmtKg(r.wood_kg + r.glass_kg + r.metal_kg)}
                  </td>
                  <td className={`${purchasingTableTdClass} text-slate-700`}>{readinessLabel(r.readiness)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PurchasingTableSection>
      ) : null}
    </div>
  );
}
