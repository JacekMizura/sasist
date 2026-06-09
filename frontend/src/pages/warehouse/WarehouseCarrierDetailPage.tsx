import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ClipboardList, Package, Printer } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ProductLikePageLayout } from "../../components/catalog/ProductLikePageLayout";
import { ProductLikeSection } from "../../components/catalog/ProductLikeSection";
import { catalogEntityCardShellClass } from "../../components/catalog/CatalogEntityPageShell";
import {
  emptyWmsCarrier,
  getWmsCarrier,
  listWmsCarrierLogs,
  type WarehouseCarrierDetailRead,
  type WarehouseCarrierLogRead,
} from "../../api/wmsCarrierApi";
import { CarrierBadge } from "../../components/warehouse/carriers/CarrierBadge";
import { CarrierItemsTable } from "../../components/warehouse/carriers/CarrierItemsTable";
import { CarrierStatusBadge } from "../../components/warehouse/carriers/CarrierStatusBadge";
import { carrierOperationLabel } from "../../components/warehouse/carriers/carrierOperationLabels";
import { carrierStatusLabel } from "../../modules/warehouse-structure/labels";
import {
  useWarehouseCarriersPaths,
  useWarehouseCarriersSurface,
  useWarehouseCarriersTenant,
} from "./warehouseCarriersTenant";
import { openCarrierLabelPrint } from "../../utils/carrierLabelPrint";

type CarrierTab = "basic" | "content" | "history";

const CARRIER_TABS = [
  { id: "basic" as const, label: "Podstawowe", icon: Package },
  { id: "content" as const, label: "Zawartość", icon: ClipboardList },
  { id: "history" as const, label: "Historia", icon: ClipboardList },
];

export default function WarehouseCarrierDetailPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const navigate = useNavigate();
  const surface = useWarehouseCarriersSurface();
  const paths = useWarehouseCarriersPaths(surface);
  const { tenantId, setTenantId, tenants, tenantSelectVisible } = useWarehouseCarriersTenant(surface);

  const [activeTab, setActiveTab] = useState<CarrierTab>("basic");
  const [detail, setDetail] = useState<WarehouseCarrierDetailRead | null>(null);
  const [logs, setLogs] = useState<WarehouseCarrierLogRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(id) || id < 1) {
      setErr("Nieprawidłowy identyfikator nośnika.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const d = await getWmsCarrier(tenantId, id);
      setDetail(d);
      setLogs(await listWmsCarrierLogs(tenantId, id));
    } catch {
      setErr("Nie udało się wczytać nośnika.");
      setDetail(null);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onEmpty = async () => {
    if (!detail || busy) return;
    if (!window.confirm("Opróżnić nośnik?")) return;
    setBusy(true);
    try {
      const d = await emptyWmsCarrier(tenantId, detail.id);
      setDetail({ ...detail, ...d, items: [] });
      setLogs(await listWmsCarrierLogs(tenantId, id));
    } catch {
      window.alert("Operacja nie powiodła się.");
    } finally {
      setBusy(false);
    }
  };

  const noopSubmit = (e: FormEvent) => e.preventDefault();

  if (loading) {
    return (
      <div className="-mx-4 -mt-4 sm:-mx-5 sm:-mt-5">
        <div className={`${catalogEntityCardShellClass} flex min-h-[40vh] items-center justify-center text-slate-500`}>
          Wczytywanie nośnika…
        </div>
      </div>
    );
  }

  if (err || !detail) {
    return (
      <div className="-mx-4 -mt-4 sm:-mx-5 sm:-mt-5">
        <div className={`${catalogEntityCardShellClass} p-8 text-center text-red-600`}>{err || "Brak danych"}</div>
      </div>
    );
  }

  const tabContent = (() => {
    switch (activeTab) {
      case "basic":
        return (
          <ProductLikeSection title="Informacje podstawowe">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-4">
                <dt className="text-xs font-medium text-slate-500">Status</dt>
                <dd className="mt-2">
                  <CarrierStatusBadge status={detail.status} />
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <dt className="text-xs font-medium text-slate-500">Lokalizacja</dt>
                <dd className="mt-2 font-mono text-lg font-semibold text-slate-900">
                  {(detail.current_location_code || "").trim() || "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <dt className="text-xs font-medium text-slate-500">Typ (grupa)</dt>
                <dd className="mt-2 text-lg font-semibold text-slate-900">
                  {(detail.carrier_group_code || "—").trim()}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <dt className="text-xs font-medium text-slate-500">Kod kreskowy</dt>
                <dd className="mt-2 font-mono text-sm text-slate-800">{detail.barcode}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <dt className="text-xs font-medium text-slate-500">Mieszanka (mix)</dt>
                <dd className="mt-2 text-lg font-semibold text-slate-900">{detail.is_mixed ? "Tak" : "Nie"}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <dt className="text-xs font-medium text-slate-500">Pozycje / SKU</dt>
                <dd className="mt-2 text-lg font-semibold tabular-nums text-slate-900">
                  {detail.items?.length ?? 0} / {detail.sku_count ?? 0}
                </dd>
              </div>
            </dl>
          </ProductLikeSection>
        );
      case "content":
        return (
          <ProductLikeSection title="Produkty na nośniku">
            <CarrierItemsTable items={detail.items} />
          </ProductLikeSection>
        );
      case "history":
        return (
          <ProductLikeSection title="Dziennik operacji">
            {logs.length === 0 ? (
              <p className="text-sm text-slate-600">Brak wpisów.</p>
            ) : (
              <ul className="max-h-[480px] space-y-2 overflow-y-auto">
                {logs.map((lg) => (
                  <li key={lg.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {carrierOperationLabel(lg.operation_type, lg.operation_type_label)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {lg.created_at ? new Date(lg.created_at).toLocaleString("pl-PL") : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{lg.performed_by_name || "—"}</p>
                  </li>
                ))}
              </ul>
            )}
          </ProductLikeSection>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="-mx-4 -mt-4 sm:-mx-5 sm:-mt-5">
      <div className={`${catalogEntityCardShellClass} overflow-hidden`}>
        <ProductLikePageLayout
          variant="page"
          modeLabel="Nośnik magazynowy"
          title={detail.code}
          titleBadge={<CarrierBadge code={detail.code} showMix={detail.is_mixed} />}
          metaChips={[
            { label: "Status", value: carrierStatusLabel(detail.status), variant: "emerald" },
            {
              label: "Lokalizacja",
              value: (detail.current_location_code || "").trim() || "—",
            },
            { label: "Grupa", value: (detail.carrier_group_code || "—").trim() },
          ]}
          headerActions={
            <div className="flex flex-wrap items-center gap-2">
              {tenantSelectVisible ? (
                <select
                  value={tenantId}
                  onChange={(e) => setTenantId(Number(e.target.value) || 1)}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || `Podmiot #${t.id}`}
                    </option>
                  ))}
                </select>
              ) : null}
              <Link
                to={paths.list}
                state={{ tenantId }}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Lista nośników
              </Link>
              <button
                type="button"
                onClick={() => openCarrierLabelPrint(detail)}
                className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" />
                Drukuj etykietę
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onEmpty()}
                className="rounded border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Opróżnij
              </button>
            </div>
          }
          tabs={CARRIER_TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onSubmit={noopSubmit}
          showSaveButton={false}
          footerExtra={
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Wstecz
            </button>
          }
        >
          {tabContent}
        </ProductLikePageLayout>
      </div>
    </div>
  );
}
