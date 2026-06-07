import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Factory, Layers, Package, ScanLine } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import { fetchProductionDashboard } from "../../api/productionApi";
import type { ProductionDashboardRead } from "../../api/productionApi";

const DEFAULT_TENANT = 1;

export default function ProductionDashboardPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [data, setData] = useState<ProductionDashboardRead | null>(null);

  useEffect(() => {
    void fetchProductionDashboard(tenantId, warehouseId).then(setData).catch(() => setData(null));
  }, [tenantId, warehouseId]);

  const tiles = [
    { label: "Aktywne partie", value: data?.active_batches ?? 0, icon: Layers, href: "/production/batches", tone: "text-violet-600" },
    { label: "Zbieranie", value: data?.collecting_batches ?? 0, icon: ScanLine, href: "/production/collecting", tone: "text-amber-600" },
    { label: "W produkcji", value: data?.in_production_batches ?? 0, icon: Factory, href: "/production/execute", tone: "text-blue-600" },
    { label: "Odłożenie", value: data?.putaway_batches ?? 0, icon: Package, href: "/production/putaway", tone: "text-emerald-600" },
    { label: "Receptury", value: data?.recipe_count ?? 0, icon: Factory, href: "/production/recipes", tone: "text-slate-700" },
    { label: "Partie z brakami", value: data?.batches_with_shortages ?? 0, icon: AlertTriangle, href: "/production/batches", tone: "text-red-600" },
  ];

  return (
    <div className="px-4 py-6 lg:px-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Produkcja magazynowa</h1>
        <p className="mt-1 text-sm text-slate-500">
          Partie produkcyjne, zbieranie surowców i odkładanie wyrobów — bez ERP, w stylu WMS.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link
            key={t.label}
            to={t.href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">{t.label}</p>
                <p className={`mt-2 text-3xl font-bold ${t.tone}`}>{t.value}</p>
              </div>
              <t.icon className={`h-8 w-8 ${t.tone} opacity-40 group-hover:opacity-70`} aria-hidden />
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-6">
        <h2 className="font-semibold text-violet-900">Szybki start</h2>
        <ol className="mt-3 space-y-2 text-sm text-violet-800 list-decimal list-inside">
          <li>
            <Link to="/production/recipes" className="underline hover:text-violet-950">
              Receptury
            </Link>{" "}
            — sprawdź skład i dostępność
          </li>
          <li>
            <Link to="/production/batches" className="underline hover:text-violet-950">
              Utwórz batch
            </Link>{" "}
            — zgrupuj produkty do fali produkcyjnej
          </li>
          <li>
            <Link to="/production/collecting" className="underline hover:text-violet-950">
              Zbierz surowce
            </Link>{" "}
            → produkcja → odkładanie (PW)
          </li>
        </ol>
      </div>
    </div>
  );
}
