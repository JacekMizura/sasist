import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Lock, Package, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { getCartons, type CartonDto } from "../../api/cartonsApi";
import {
  deleteProductManualRule,
  getProductSmartMatchingPanel,
  postProductManualRule,
  putProductSmartMatchingEnabled,
  putRuleV2Lock,
  type WmsSmartMatchingProductPanelApi,
  type WmsSmartMatchingRuleV2Api,
} from "../../api/wmsSmartMatchingApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { WarehouseFormCard as Card } from "./WarehouseFormCard";

export type ProductLogisticsPackagingMatchingSectionProps = {
  productId: number | null;
  tenantId: number | null;
  dimensionsComplete: boolean;
  isNew?: boolean;
};

export function ProductLogisticsPackagingMatchingSection({
  productId,
  tenantId,
  dimensionsComplete,
  isNew,
}: ProductLogisticsPackagingMatchingSectionProps) {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [cartons, setCartons] = useState<CartonDto[]>([]);
  const [panel, setPanel] = useState<WmsSmartMatchingProductPanelApi | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftMinQty, setDraftMinQty] = useState<number | "">(1);
  const [draftCartonId, setDraftCartonId] = useState("");
  const [saving, setSaving] = useState(false);

  const canLoad =
    tenantId != null && tenantId > 0 && warehouseId != null && productId != null && productId > 0;

  const reload = useCallback(async () => {
    if (!canLoad) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProductSmartMatchingPanel(tenantId!, warehouseId!, productId!);
      setPanel(data);
    } catch {
      setError("Nie udało się wczytać Smart Matching.");
      setPanel(null);
    } finally {
      setLoading(false);
    }
  }, [canLoad, tenantId, warehouseId, productId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (tenantId == null || warehouseId == null || tenantId < 1) {
      setCartons([]);
      return;
    }
    let cancel = false;
    void getCartons({ tenant_id: tenantId, warehouse_id: warehouseId, active_only: true })
      .then((rows) => {
        if (!cancel) setCartons(rows);
      })
      .catch(() => {
        if (!cancel) setCartons([]);
      });
    return () => {
      cancel = true;
    };
  }, [tenantId, warehouseId]);

  const setEnabled = async (enabled: boolean) => {
    if (!canLoad) return;
    setSaving(true);
    setError(null);
    try {
      const data = await putProductSmartMatchingEnabled(tenantId!, warehouseId!, productId!, enabled);
      setPanel(data);
    } catch {
      setError("Nie udało się zapisać ustawienia produktu.");
    } finally {
      setSaving(false);
    }
  };

  const addManual = async () => {
    if (!canLoad || draftCartonId === "" || draftMinQty === "" || Number(draftMinQty) < 1) return;
    setSaving(true);
    setError(null);
    try {
      await postProductManualRule(tenantId!, warehouseId!, productId!, {
        min_qty: Number(draftMinQty),
        carton_id: draftCartonId,
        is_locked: false,
      });
      setDraftMinQty(1);
      setDraftCartonId("");
      await reload();
    } catch {
      setError("Nie udało się dodać reguły ręcznej.");
    } finally {
      setSaving(false);
    }
  };

  const toggleLock = async (rule: WmsSmartMatchingRuleV2Api) => {
    if (!canLoad || rule.source !== "MANUAL") return;
    setSaving(true);
    try {
      await putRuleV2Lock(tenantId!, warehouseId!, rule.id, !rule.is_locked);
      await reload();
    } catch {
      setError("Nie udało się zmienić blokady reguły.");
    } finally {
      setSaving(false);
    }
  };

  const removeManual = async (rule: WmsSmartMatchingRuleV2Api) => {
    if (!canLoad || rule.source !== "MANUAL" || rule.is_locked) return;
    setSaving(true);
    try {
      await deleteProductManualRule(tenantId!, warehouseId!, productId!, rule.id);
      await reload();
    } catch {
      setError("Nie udało się usunąć reguły (zablokowana?).");
    } finally {
      setSaving(false);
    }
  };

  if (isNew || productId == null) {
    return (
      <Card title="Smart Matching">
        <p className="text-sm text-slate-600">
          Po zapisaniu produktu skonfigurujesz tu Smart Matching (ON/OFF, reguły ręczne, historia).
        </p>
      </Card>
    );
  }

  if (tenantId == null || tenantId < 1) {
    return (
      <Card title="Smart Matching">
        <p className="text-sm text-amber-800">Wybierz tenant.</p>
      </Card>
    );
  }

  if (warehouseId == null) {
    return (
      <Card title="Smart Matching">
        <p className="text-sm text-amber-800">Wybierz magazyn.</p>
      </Card>
    );
  }

  const enabled = panel?.smart_matching_enabled ?? true;
  const manualRules = (panel?.rules ?? []).filter((r) => r.source === "MANUAL");
  const autoRules = (panel?.rules ?? []).filter((r) => r.source === "AUTO");
  const conflicts = panel?.conflicts ?? [];

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <div className="space-y-8">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-800">Smart Matching</h3>
        </div>

        {!dimensionsComplete ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Uzupełnij wymiary produktu — 3D Matching działa lepiej z kompletnymi danymi.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <section>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-5">
            <div>
              <p className="font-semibold text-slate-800">Smart Matching dla produktu</p>
              <p className="mt-0.5 text-sm text-slate-500">
                OFF: historia nadal zapisywana; bez uczenia AUTO i bez sugestii Smart (3D wg strategii).
              </p>
            </div>
            <label className="relative ml-4 inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={enabled}
                disabled={loading || saving}
                onChange={(e) => void setEnabled(e.target.checked)}
              />
              <div className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-blue-600 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
            </label>
          </div>
        </section>

        {conflicts.length > 0 ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Konflikt reguł (AMBIGUOUS)</p>
            <ul className="mt-2 list-disc pl-5">
              {conflicts.map((c) => (
                <li key={c.id}>
                  min. {c.min_qty} → {c.carton_name || c.carton_id} ({c.source})
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs">Brak auto-sugestii do czasu rozstrzygnięcia ręcznego.</p>
          </section>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Reguły ręczne (min. ilość → opakowanie)
            </h4>
            <Link
              to="/warehouse-materials/cartons"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Katalog kartonów
            </Link>
          </div>

          {manualRules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center gap-2 text-sm text-slate-800">
                <Package className="h-4 w-4 text-indigo-600" />
                <span>
                  od <strong>{rule.min_qty}</strong> szt. → {rule.carton_name || rule.carton_id}
                </span>
                {rule.is_locked ? (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    <Lock className="h-3 w-3" /> LOCK
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void toggleLock(rule)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {rule.is_locked ? "Odblokuj" : "Zablokuj"}
                </button>
                <button
                  type="button"
                  disabled={saving || rule.is_locked}
                  onClick={() => void removeManual(rule)}
                  className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                >
                  Usuń
                </button>
              </div>
            </div>
          ))}

          <div className="grid gap-3 rounded-lg border border-dashed border-slate-300 p-4 sm:grid-cols-3">
            <label className="text-xs font-semibold uppercase text-slate-500">
              Min. ilość
              <input
                type="number"
                min={1}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={draftMinQty}
                onChange={(e) =>
                  setDraftMinQty(e.target.value === "" ? "" : Math.max(1, Number(e.target.value) || 1))
                }
              />
            </label>
            <label className="text-xs font-semibold uppercase text-slate-500 sm:col-span-2">
              Opakowanie
              <select
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={draftCartonId}
                onChange={(e) => setDraftCartonId(e.target.value)}
              >
                <option value="">Wybierz…</option>
                {cartons.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={saving || !draftCartonId || draftMinQty === ""}
              onClick={() => void addManual()}
              className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 sm:col-span-3"
            >
              Dodaj regułę ręczną
            </button>
          </div>
        </section>

        {autoRules.length > 0 ? (
          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Reguły AUTO</h4>
            <ul className="space-y-1 text-sm text-slate-700">
              {autoRules.map((r) => (
                <li key={r.id}>
                  od {r.min_qty} → {r.carton_name || r.carton_id}{" "}
                  <span className="text-xs text-slate-500">
                    ({r.status}, hits {r.hit_count})
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Ostatnie decyzje (produkt)
          </h4>
          {loading && !panel ? (
            <p className="text-sm text-slate-500">Ładowanie…</p>
          ) : (panel?.recent_observations?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">Brak obserwacji v2.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-auto text-sm text-slate-700">
              {panel!.recent_observations.map((o) => (
                <li key={o.id}>
                  qty {o.quantity} → {o.carton_name || o.carton_id || "—"}{" "}
                  <span className="text-xs text-slate-400">#{o.order_id}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Card>
  );
}

export default ProductLogisticsPackagingMatchingSection;
