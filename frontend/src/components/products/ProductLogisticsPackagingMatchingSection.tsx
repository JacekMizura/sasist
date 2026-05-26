import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Box, Link2, Package, Sparkles, Truck } from "lucide-react";
import { Link } from "react-router-dom";

import { getCartons, type CartonDto } from "../../api/cartonsApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { WarehouseFormCard as Card } from "./WarehouseFormCard";

const LS_KEY = "product.packaging_matching.ui.v1";

type ManualRuleRow = {
  id: string;
  carton_id: string | null;
  qty_min: number | "";
  qty_max: number | "";
  protection_pct: number | "";
  disable_smart_for_carton: boolean;
};

type StoredPackagingMatching = {
  exclude_from_matching: boolean;
  manual_rules: ManualRuleRow[];
};

const emptyStored = (): StoredPackagingMatching => ({
  exclude_from_matching: false,
  manual_rules: [],
});

function storageKey(tenantId: number, warehouseId: number, productId: number): string {
  return `${LS_KEY}:${tenantId}:${warehouseId}:${productId}`;
}

function loadStored(tenantId: number, warehouseId: number, productId: number): StoredPackagingMatching {
  try {
    const raw = localStorage.getItem(storageKey(tenantId, warehouseId, productId));
    if (!raw) return emptyStored();
    const o = JSON.parse(raw) as Partial<StoredPackagingMatching>;
    if (!o || typeof o !== "object") return emptyStored();
    return {
      exclude_from_matching: Boolean(o.exclude_from_matching),
      manual_rules: Array.isArray(o.manual_rules) ? o.manual_rules.filter((r) => r && typeof r.id === "string") : [],
    };
  } catch {
    return emptyStored();
  }
}

function saveStored(tenantId: number, warehouseId: number, productId: number, data: StoredPackagingMatching): void {
  try {
    localStorage.setItem(storageKey(tenantId, warehouseId, productId), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function newRuleId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const pill =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none tabular-nums";

const inputMini =
  "w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30";

export type ProductLogisticsPackagingMatchingSectionProps = {
  productId: number | null;
  tenantId: number | null;
  /** Komplet L×W×H pojedynczej sztuki — pod podgląd 3D */
  dimensionsComplete: boolean;
  isNew?: boolean;
};

/**
 * Konfiguracja dopasowania opakowań na poziomie produktu — źródło dla Smart / 3D / etykiet (docelowo API).
 */
export function ProductLogisticsPackagingMatchingSection({
  productId,
  tenantId,
  dimensionsComplete,
  isNew,
}: ProductLogisticsPackagingMatchingSectionProps) {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [cartons, setCartons] = useState<CartonDto[]>([]);
  const [cartonsLoading, setCartonsLoading] = useState(false);
  const [excludeProduct, setExcludeProduct] = useState(false);
  const [manualRules, setManualRules] = useState<ManualRuleRow[]>([]);

  const canPersist = tenantId != null && tenantId > 0 && warehouseId != null && productId != null && productId > 0;

  useEffect(() => {
    if (!canPersist) return;
    const s = loadStored(tenantId!, warehouseId!, productId!);
    setExcludeProduct(s.exclude_from_matching);
    setManualRules(s.manual_rules.length ? s.manual_rules : []);
  }, [canPersist, tenantId, warehouseId, productId]);

  const flushSave = useCallback(
    (exclude: boolean, rules: ManualRuleRow[]) => {
      if (!canPersist) return;
      saveStored(tenantId!, warehouseId!, productId!, {
        exclude_from_matching: exclude,
        manual_rules: rules,
      });
    },
    [canPersist, tenantId, warehouseId, productId],
  );

  useEffect(() => {
    if (tenantId == null || warehouseId == null || tenantId < 1) {
      setCartons([]);
      return;
    }
    let cancel = false;
    setCartonsLoading(true);
    void getCartons({ tenant_id: tenantId, warehouse_id: warehouseId, active_only: true })
      .then((rows) => {
        if (!cancel) setCartons(rows);
      })
      .catch(() => {
        if (!cancel) setCartons([]);
      })
      .finally(() => {
        if (!cancel) setCartonsLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [tenantId, warehouseId]);

  const cartonById = useMemo(() => {
    const m = new Map<string, CartonDto>();
    for (const c of cartons) m.set(String(c.id), c);
    return m;
  }, [cartons]);

  const addRule = useCallback(() => {
    const row: ManualRuleRow = {
      id: newRuleId(),
      carton_id: null,
      qty_min: "",
      qty_max: "",
      protection_pct: "",
      disable_smart_for_carton: false,
    };
    setManualRules((prev) => {
      const next = [...prev, row];
      flushSave(excludeProduct, next);
      return next;
    });
  }, [flushSave, excludeProduct]);

  const patchRule = useCallback(
    (id: string, patch: Partial<ManualRuleRow>) => {
      setManualRules((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, ...patch } : r));
        flushSave(excludeProduct, next);
        return next;
      });
    },
    [flushSave, excludeProduct],
  );

  const removeRule = useCallback(
    (id: string) => {
      setManualRules((prev) => {
        const next = prev.filter((r) => r.id !== id);
        flushSave(excludeProduct, next);
        return next;
      });
    },
    [flushSave, excludeProduct],
  );

  const setExclude = useCallback(
    (v: boolean) => {
      setExcludeProduct(v);
      setManualRules((prev) => {
        flushSave(v, prev);
        return prev;
      });
    },
    [flushSave],
  );

  if (isNew || productId == null) {
    return (
      <Card title="Dopasowanie opakowań" className="border-violet-100 ring-1 ring-violet-100/70">
        <p className="text-sm text-slate-600">
          Po zapisaniu produktu skonfigurujesz tu reguły kartonów, próg ilościowy i źródła dopasowania dla Smart Matching oraz 3D
          Matching — tak jak w Sellasist.
        </p>
      </Card>
    );
  }

  if (tenantId == null || tenantId < 1) {
    return (
      <Card title="Dopasowanie opakowań" className="border-violet-100 ring-1 ring-violet-100/70">
        <p className="text-sm text-amber-800">Wybierz dzierżawę (tenant), aby wczytać kartony magazynowe.</p>
      </Card>
    );
  }

  if (warehouseId == null) {
    return (
      <Card title="Dopasowanie opakowań" className="border-violet-100 ring-1 ring-violet-100/70">
        <p className="text-sm text-amber-800">Wybierz magazyn w górnym pasku — kartony i reguły są per magazyn.</p>
      </Card>
    );
  }

  return (
    <Card title="Dopasowanie opakowań" className="border-violet-100 ring-1 ring-violet-100/70">


      <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-amber-700 focus:ring-amber-500"
          checked={excludeProduct}
          onChange={(e) => setExclude(e.target.checked)}
        />
        <span className="text-sm text-amber-950">
          <span className="font-semibold">Wyklucz produkt z automatycznego dopasowania opakowań</span>
        </span>
      </label>

      {/* A — reguły ręczne */}
      <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
          <div>
            <h5 className="text-xs font-bold uppercase tracking-wide text-slate-700">Przypisz karton</h5>
          </div>
          <Link
            to="/warehouse-materials/cartons"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline"
          >
            <Truck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Katalog kartonów
          </Link>
        </div>

        {excludeProduct ? (
          <p className="mt-3 text-xs text-slate-500"></p>
        ) : (
          <>
            <div className="mt-3 space-y-2">
              {manualRules.map((rule) => {
                const c = rule.carton_id ? cartonById.get(rule.carton_id) : undefined;
                const dim =
                  c != null ? `${c.length_cm}×${c.width_cm}×${c.height_cm} cm` : rule.carton_id ? "—" : "Wybierz karton";
                return (
                  <div
                    key={rule.id}
                    className="rounded-lg border border-slate-200/90 bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200/90 bg-slate-50">
                        {c?.image_url ? (
                          <img src={c.image_url} alt="" className="max-h-full max-w-full object-contain p-0.5" />
                        ) : (
                          <Box className="h-5 w-5 text-slate-400" strokeWidth={1.5} aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`${pill} border-violet-200 bg-violet-50 text-violet-900`}>Ręcznie</span>
                          <button
                            type="button"
                            className="ml-auto text-[11px] font-semibold text-red-600 hover:underline sm:ml-0"
                            onClick={() => removeRule(rule.id)}
                          >
                            Usuń
                          </button>
                        </div>
                        <label className="block">
                          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Karton wysyłkowy
                          </span>
                          <select
                            className={`${inputMini} max-w-md`}
                            value={rule.carton_id ?? ""}
                            disabled={cartonsLoading}
                            onChange={(e) => patchRule(rule.id, { carton_id: e.target.value === "" ? null : e.target.value })}
                          >
                            <option value="">{cartonsLoading ? "Ładowanie…" : "— Wybierz —"}</option>
                            {cartons.map((ct) => (
                              <option key={ct.id} value={String(ct.id)}>
                                {(ct.name ?? "").trim() || ct.id}
                              </option>
                            ))}
                          </select>
                          <span className="mt-0.5 block text-[10px] text-slate-500">{dim}</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <label>
                            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Ilość od
                            </span>
                            <input
                              type="number"
                              min={0}
                              className={inputMini}
                              placeholder="—"
                              value={rule.qty_min === "" ? "" : rule.qty_min}
                              onChange={(e) => {
                                const s = e.target.value.trim();
                                if (s === "") patchRule(rule.id, { qty_min: "" });
                                else {
                                  const n = Number(s);
                                  if (Number.isFinite(n) && n >= 0) patchRule(rule.id, { qty_min: n });
                                }
                              }}
                            />
                          </label>
                          <label>
                            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Ilość do
                            </span>
                            <input
                              type="number"
                              min={0}
                              className={inputMini}
                              placeholder="∞"
                              value={rule.qty_max === "" ? "" : rule.qty_max}
                              onChange={(e) => {
                                const s = e.target.value.trim();
                                if (s === "") patchRule(rule.id, { qty_max: "" });
                                else {
                                  const n = Number(s);
                                  if (Number.isFinite(n) && n >= 0) patchRule(rule.id, { qty_max: n });
                                }
                              }}
                            />
                          </label>
                          <label>
                            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Ochrona %
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              className={inputMini}
                              placeholder="0"
                              value={rule.protection_pct === "" ? "" : rule.protection_pct}
                              onChange={(e) => {
                                const s = e.target.value.trim();
                                if (s === "") patchRule(rule.id, { protection_pct: "" });
                                else {
                                  const n = Number(s);
                                  if (Number.isFinite(n)) patchRule(rule.id, { protection_pct: Math.min(100, Math.max(0, n)) });
                                }
                              }}
                            />
                          </label>
                          <div className="flex flex-col justify-end">
                            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Smart / ten karton
                            </span>
                            <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200/90 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                checked={rule.disable_smart_for_carton}
                                onChange={(e) => patchRule(rule.id, { disable_smart_for_carton: e.target.checked })}
                              />
                              Wyłącz dopasowanie
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addRule}
              disabled={excludeProduct}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-950 hover:bg-violet-100 disabled:opacity-40"
            >
              <Package className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Dodaj karton do produktu
            </button>

          </>
        )}
      </div>

      {/* B — uczenie */}
      <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/25 p-3">
        <div className="flex flex-wrap items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" strokeWidth={2} aria-hidden />
          <div className="min-w-0 flex-1">
            <h5 className="text-xs font-bold uppercase tracking-wide text-emerald-900">Smart Matching</h5>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-dashed border-emerald-300/80 bg-white/80 px-3 py-4 text-center">
          <p className="text-xs font-medium text-slate-600">Brak wpisów</p>
        </div>
      </div>

      {/* C — 3D */}
      <div className="rounded-xl border border-sky-200/80 bg-sky-50/30 p-3">
        <div className="flex flex-wrap items-start gap-2">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" strokeWidth={2} aria-hidden />
          <div className="min-w-0 flex-1">
            <h5 className="text-xs font-bold uppercase tracking-wide text-sky-900">Zgodność z 3D matching</h5>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {dimensionsComplete ? (
            <span className={`${pill} border-emerald-300 bg-emerald-50 text-emerald-900`}>Wymiary kompletne</span>
          ) : (
            <>
              <span className={`${pill} border-amber-300 bg-amber-50 text-amber-950`}>Uzupełnij wymiary powyżej</span>
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                Bez wymiarów dopasowanie jest ograniczone.
              </span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export default ProductLogisticsPackagingMatchingSection;
