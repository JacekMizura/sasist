import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Package,
  Sparkles,
  Truck,
} from "lucide-react";
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

function storageKey(
  tenantId: number,
  warehouseId: number,
  productId: number,
): string {
  return `${LS_KEY}:${tenantId}:${warehouseId}:${productId}`;
}

function loadStored(
  tenantId: number,
  warehouseId: number,
  productId: number,
): StoredPackagingMatching {
  try {
    const raw = localStorage.getItem(
      storageKey(tenantId, warehouseId, productId),
    );

    if (!raw) return emptyStored();

    const o = JSON.parse(raw) as Partial<StoredPackagingMatching>;

    if (!o || typeof o !== "object") return emptyStored();

    return {
      exclude_from_matching: Boolean(
        o.exclude_from_matching,
      ),
      manual_rules: Array.isArray(o.manual_rules)
        ? o.manual_rules.filter(
            (r) => r && typeof r.id === "string",
          )
        : [],
    };
  } catch {
    return emptyStored();
  }
}

function saveStored(
  tenantId: number,
  warehouseId: number,
  productId: number,
  data: StoredPackagingMatching,
): void {
  try {
    localStorage.setItem(
      storageKey(tenantId, warehouseId, productId),
      JSON.stringify(data),
    );
  } catch {
    //
  }
}

function newRuleId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

export type ProductLogisticsPackagingMatchingSectionProps =
  {
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

  const [cartons, setCartons] = useState<CartonDto[]>(
    [],
  );

  const [cartonsLoading, setCartonsLoading] =
    useState(false);

  const [excludeProduct, setExcludeProduct] =
    useState(false);

  const [manualRules, setManualRules] = useState<
    ManualRuleRow[]
  >([]);

  const canPersist =
    tenantId != null &&
    tenantId > 0 &&
    warehouseId != null &&
    productId != null &&
    productId > 0;

  useEffect(() => {
    if (!canPersist) return;

    const s = loadStored(
      tenantId!,
      warehouseId!,
      productId!,
    );

    setExcludeProduct(s.exclude_from_matching);
    setManualRules(
      s.manual_rules.length
        ? s.manual_rules
        : [],
    );
  }, [
    canPersist,
    tenantId,
    warehouseId,
    productId,
  ]);

  const flushSave = useCallback(
    (
      exclude: boolean,
      rules: ManualRuleRow[],
    ) => {
      if (!canPersist) return;

      saveStored(
        tenantId!,
        warehouseId!,
        productId!,
        {
          exclude_from_matching: exclude,
          manual_rules: rules,
        },
      );
    },
    [
      canPersist,
      tenantId,
      warehouseId,
      productId,
    ],
  );

  useEffect(() => {
    if (
      tenantId == null ||
      warehouseId == null ||
      tenantId < 1
    ) {
      setCartons([]);
      return;
    }

    let cancel = false;

    setCartonsLoading(true);

    void getCartons({
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      active_only: true,
    })
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

    for (const c of cartons) {
      m.set(String(c.id), c);
    }

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
    (
      id: string,
      patch: Partial<ManualRuleRow>,
    ) => {
      setManualRules((prev) => {
        const next = prev.map((r) =>
          r.id === id
            ? { ...r, ...patch }
            : r,
        );

        flushSave(excludeProduct, next);

        return next;
      });
    },
    [flushSave, excludeProduct],
  );

  const removeRule = useCallback(
    (id: string) => {
      setManualRules((prev) => {
        const next = prev.filter(
          (r) => r.id !== id,
        );

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
      <Card title="Dopasowanie opakowań">
        <p className="text-sm text-slate-600">
          Po zapisaniu produktu skonfigurujesz
          tu reguły dopasowania kartonów.
        </p>
      </Card>
    );
  }

  if (tenantId == null || tenantId < 1) {
    return (
      <Card title="Dopasowanie opakowań">
        <p className="text-sm text-amber-800">
          Wybierz tenant.
        </p>
      </Card>
    );
  }

  if (warehouseId == null) {
    return (
      <Card title="Dopasowanie opakowań">
        <p className="text-sm text-amber-800">
          Wybierz magazyn.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <div className="space-y-10">
        <section>
          <h3 className="mb-6 border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">
            Dopasowanie opakowań (Wysyłka)
          </h3>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-5 transition-colors hover:border-slate-300">
            <div>
              <p className="font-semibold text-slate-800">
                Wyklucz produkt z automatycznego
                dopasowania
              </p>

              <p className="mt-0.5 text-sm text-slate-500">
                Produkt będzie wymagał ręcznego
                wyboru kartonu przy pakowaniu
                paczki.
              </p>
            </div>

            <label className="relative ml-4 inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={excludeProduct}
                onChange={(e) =>
                  setExclude(
                    e.target.checked,
                  )
                }
              />

              <div className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-blue-600 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <div className="mb-2 flex items-end justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Przypisz karton
            </h4>

            <Link
              to="/warehouse-materials/cartons"
              className="flex items-center gap-1.5 text-sm font-medium text-blue-600 transition-colors hover:text-blue-800"
            >
              <Truck className="h-4 w-4" />
              Katalog kartonów
            </Link>
          </div>

          {excludeProduct ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Produkt wykluczony z
              automatycznego dopasowania.
            </div>
          ) : (
            <>
              {manualRules.map((rule) => {
                const carton =
                  rule.carton_id != null
                    ? cartonById.get(
                        rule.carton_id,
                      )
                    : undefined;

                return (
                  <div
                    key={rule.id}
                    className="group relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                  >
                    <div className="mb-5 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded bg-indigo-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700">
                        <Package className="h-3.5 w-3.5" />
                        Ręcznie
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          removeRule(rule.id)
                        }
                        className="p-1 text-slate-400 transition-colors hover:text-rose-600"
                      >
                        Usuń
                      </button>
                    </div>

                    <div className="mb-5">
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Karton wysyłkowy
                      </label>

                      <select
                        className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        value={
                          rule.carton_id ??
                          ""
                        }
                        disabled={
                          cartonsLoading
                        }
                        onChange={(e) =>
                          patchRule(rule.id, {
                            carton_id:
                              e.target.value ===
                              ""
                                ? null
                                : e.target.value,
                          })
                        }
                      >
                        <option value="">
                          {cartonsLoading
                            ? "Ładowanie..."
                            : "Wybierz karton..."}
                        </option>

                        {cartons.map((ct) => (
                          <option
                            key={ct.id}
                            value={String(
                              ct.id,
                            )}
                          >
                            {ct.name}
                          </option>
                        ))}
                      </select>

                      {carton ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {
                            carton.length_cm
                          }{" "}
                          × {
                            carton.width_cm
                          }{" "}
                          × {
                            carton.height_cm
                          }{" "}
                          cm
                        </p>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-4">
                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Ilość od
                        </label>

                        <input
                          type="number"
                          min={0}
                          value={rule.qty_min}
                          onChange={(e) => {
                            const v =
                              e.target.value.trim();

                            patchRule(
                              rule.id,
                              {
                                qty_min:
                                  v === ""
                                    ? ""
                                    : Number(
                                        v,
                                      ),
                              },
                            );
                          }}
                          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Ilość do
                        </label>

                        <input
                          type="number"
                          min={0}
                          value={rule.qty_max}
                          onChange={(e) => {
                            const v =
                              e.target.value.trim();

                            patchRule(
                              rule.id,
                              {
                                qty_max:
                                  v === ""
                                    ? ""
                                    : Number(
                                        v,
                                      ),
                              },
                            );
                          }}
                          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Ochrona %
                        </label>

                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={
                            rule.protection_pct
                          }
                          onChange={(e) => {
                            const v =
                              e.target.value.trim();

                            patchRule(
                              rule.id,
                              {
                                protection_pct:
                                  v === ""
                                    ? ""
                                    : Number(
                                        v,
                                      ),
                              },
                            );
                          }}
                          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div className="flex h-[38px] items-center border-l border-slate-100 pl-2">
                        <label className="flex cursor-pointer items-start gap-2.5">
                          <input
                            type="checkbox"
                            checked={Boolean(
                              rule.disable_smart_for_carton,
                            )}
                            onChange={(e) =>
                              patchRule(
                                rule.id,
                                {
                                  disable_smart_for_carton:
                                    e.target
                                      .checked,
                                },
                              )
                            }
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />

                          <span className="text-[11px] font-semibold uppercase tracking-wider leading-tight text-slate-600">
                            Wyłącz
                            <br />
                            Smart
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={addRule}
                disabled={excludeProduct}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40"
              >
                <Package className="h-4 w-4" />
                Dodaj kolejny karton
              </button>
            </>
          )}
        </section>

        <section className="space-y-4 border-t border-slate-100 pt-6">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" />

              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Smart Matching
              </h4>
            </div>

            <div className="rounded border border-emerald-100 bg-white p-3 text-center shadow-sm">
              <span className="text-sm font-medium text-slate-500">
                Brak wpisów o historycznych
                pakowaniach dla tego SKU.
              </span>
            </div>
          </div>

          {!dimensionsComplete && (
            <div className="flex flex-col items-start justify-between gap-5 rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm sm:flex-row sm:items-center">
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />

                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">
                    Zgodność z 3D Matching
                  </h4>
                </div>

                <p className="text-sm font-medium text-amber-700">
                  Bez uzupełnionych wymiarów
                  i wagi produktu,
                  automatyczne dopasowywanie
                  na podstawie objętości (3D)
                  będzie niemożliwe.
                </p>
              </div>

              <button
                type="button"
                className="shrink-0 rounded border border-amber-300 bg-white px-5 py-2.5 text-sm font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-100 hover:text-amber-900"
              >
                Uzupełnij wymiary
              </button>
            </div>
          )}
        </section>
      </div>
    </Card>
  );
}

export default ProductLogisticsPackagingMatchingSection;