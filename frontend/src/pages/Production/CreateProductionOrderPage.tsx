import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";

import {
  createProductionBatch,
  listRecipeCards,
  previewProductionBatch,
  validateProductionBatchCreateBody,
  type ProductionBatchPreviewRead,
  type RecipeCardRead,
} from "@/api/productionApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { useAuth } from "@/context/AuthContext";
import { useActiveWarehouseContext } from "@/hooks/useActiveWarehouseContext";
import { ActiveWarehouseRequiredBanner } from "@/components/layout/ActiveWarehouseRequiredBanner";
import { ProductThumb } from "./components/ProductThumb";
import { formatDurationMinutes } from "./productionTheme";
import { formatProductionMoney, stockTone, STOCK_TONE_CLASS } from "./productionUi";
import { erpProductionPaths } from "./productionPaths";
import { productionPageDescClass, productionPageStackClass, productionPageTitleClass } from "./productionLayoutTokens";
import {
  Card,
  Input,
  ListTile,
  MetricCard,
  PageHeader,
  PrimaryButton,
  ProgressBar,
  SearchInput,
  StatusBadge,
  Stepper,
  secondaryButtonClassName,
} from "@/design-system";

const DEFAULT_TENANT = 1;

const STEPS = [
  { id: "product", label: "Produkt", description: "Co produkujemy" },
  { id: "qty", label: "Ilość", description: "Materiały i koszt" },
  { id: "summary", label: "Podsumowanie", description: "Utwórz zlecenie" },
] as const;

function todayLabel(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export default function CreateProductionOrderPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const tenantId = DEFAULT_TENANT;

  const [recipes, setRecipes] = useState<RecipeCardRead[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RecipeCardRead | null>(null);
  const [qty, setQty] = useState(1);
  const [preview, setPreview] = useState<ProductionBatchPreviewRead | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reserveMaterials, setReserveMaterials] = useState(false);

  const operatorName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.login || "—";

  const reloadRecipes = useCallback(async () => {
    if (warehouseId == null) return;
    setLoadingRecipes(true);
    try {
      setRecipes(await listRecipeCards(tenantId, warehouseId, { activeOnly: true }));
    } catch {
      setRecipes([]);
      toast.error("Nie udało się wczytać receptur.");
    } finally {
      setLoadingRecipes(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reloadRecipes();
  }, [reloadRecipes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter(
      (r) =>
        r.product_name.toLowerCase().includes(q) ||
        r.recipe_name.toLowerCase().includes(q) ||
        (r.product_sku ?? "").toLowerCase().includes(q)
    );
  }, [recipes, search]);

  useEffect(() => {
    if (!selected || warehouseId == null || qty <= 0) {
      setPreview(null);
      return;
    }
    const validation = validateProductionBatchCreateBody(
      warehouseId,
      [
        {
          product_id: selected.product_id,
          composition_id: selected.composition_id,
          planned_quantity: qty,
        },
      ],
      { reserve_materials: reserveMaterials }
    );
    if (!validation.ok) {
      setPreview(null);
      return;
    }
    const t = window.setTimeout(() => {
      setPreviewBusy(true);
      void previewProductionBatch(tenantId, validation.body)
        .then(setPreview)
        .catch((err: unknown) => {
          setPreview(null);
          toast.error(extractApiErrorMessage(err, "Nie udało się wygenerować podglądu."));
        })
        .finally(() => setPreviewBusy(false));
    }, 280);
    return () => window.clearTimeout(t);
  }, [selected, qty, tenantId, warehouseId, reserveMaterials]);

  const activeStep = !selected ? 0 : preview ? 2 : 1;

  const payloadValidation = useMemo(() => {
    if (!selected || warehouseId == null) return { ok: false as const, message: "" };
    return validateProductionBatchCreateBody(
      warehouseId,
      [
        {
          product_id: selected.product_id,
          composition_id: selected.composition_id,
          planned_quantity: qty,
        },
      ],
      { reserve_materials: reserveMaterials }
    );
  }, [selected, warehouseId, qty, reserveMaterials]);

  const canSubmit = payloadValidation.ok && !busy && !previewBusy && preview != null;

  const selectRecipe = (r: RecipeCardRead) => {
    setSelected(r);
    setQty(Math.max(1, Math.floor(r.max_producible) || 1));
  };

  const submit = async () => {
    if (!payloadValidation.ok) {
      toast.error(payloadValidation.message || "Uzupełnij dane zlecenia.");
      return;
    }
    setBusy(true);
    try {
      const batch = await createProductionBatch(tenantId, payloadValidation.body);
      toast.success("Zlecenie produkcyjne utworzone.");
      navigate(`${erpProductionPaths.orders}?highlight=batch-${batch.id}`);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się utworzyć zlecenia."));
    } finally {
      setBusy(false);
    }
  };

  if (!hasActiveWarehouse || warehouseId == null) {
    return <ActiveWarehouseRequiredBanner hint="Wybierz magazyn, aby utworzyć zlecenie produkcyjne." />;
  }

  const materialsOk = preview != null && !preview.has_shortages;
  const materialsPct =
    preview && preview.aggregated_components.length > 0
      ? Math.round(
          (preview.aggregated_components.filter((c) => c.missing <= 0).length /
            preview.aggregated_components.length) *
            100
        )
      : 0;

  return (
    <div className={`${productionPageStackClass} !space-y-4`}>
      <PageHeader
        title={
          <div>
            <h1 className={productionPageTitleClass}>Nowe zlecenie produkcyjne</h1>
            <p className={productionPageDescClass}>Wybierz produkt, ustaw ilość i utwórz zlecenie — bez analizy całego magazynu.</p>
          </div>
        }
        actions={
          <Link to={erpProductionPaths.orders} className={secondaryButtonClassName("", "compact")}>
            Anuluj
          </Link>
        }
      />

      <Card variant="section" density="comfortable">
        <Stepper steps={[...STEPS]} activeIndex={activeStep} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-3">
          <Card variant="section" density="comfortable" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">1. Co chcemy wyprodukować?</h2>
              {selected ? <StatusBadge tone="success" density="compact">Wybrano</StatusBadge> : null}
            </div>
            <SearchInput
              density="comfortable"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj produktu, SKU lub receptury…"
              aria-label="Szukaj produktu"
              className="w-full"
            />
            {loadingRecipes ? (
              <p className="text-sm text-slate-500">Wczytywanie receptur…</p>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Brak aktywnych receptur.</p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto sm:max-h-80">
                {filtered.map((r) => {
                  const active = selected?.composition_id === r.composition_id;
                  return (
                    <li key={r.composition_id}>
                      <button type="button" className="w-full text-left" onClick={() => selectRecipe(r)}>
                        <ListTile selected={active} density="compact" className="transition hover:border-slate-300">
                          <div className="flex items-center gap-3">
                            <ProductThumb imageUrl={r.product_image_url} name={r.product_name} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{r.product_name}</p>
                              <p className="truncate text-xs text-slate-500">
                                {r.product_sku || "—"} · {r.recipe_name}
                              </p>
                            </div>
                            <span className="shrink-0 tabular-nums text-xs text-slate-500">
                              stan {r.current_stock}
                            </span>
                          </div>
                        </ListTile>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {selected ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <div className="flex gap-3">
                  <ProductThumb imageUrl={selected.product_image_url} name={selected.product_name} size="md" />
                  <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                    <div className="col-span-2 sm:col-span-3">
                      <dt className="text-slate-400">Nazwa</dt>
                      <dd className="font-semibold text-slate-900">{selected.product_name}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">SKU</dt>
                      <dd className="text-slate-800">{selected.product_sku || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">EAN</dt>
                      <dd className="text-slate-800">—</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Stan</dt>
                      <dd className="tabular-nums text-slate-800">{selected.current_stock}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Receptura</dt>
                      <dd className="truncate text-slate-800">
                        {selected.recipe_name} (v{selected.version})
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Czas produkcji</dt>
                      <dd className="text-slate-800">
                        {preview?.estimated_duration_minutes != null
                          ? formatDurationMinutes(preview.estimated_duration_minutes)
                          : "po ustawieniu ilości"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Max. możliwa produkcja</dt>
                      <dd className="tabular-nums text-slate-800">{Math.floor(selected.max_producible)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            ) : null}
          </Card>

          <Card variant="section" density="comfortable" className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">2. Ile chcemy wyprodukować?</h2>
            {!selected ? (
              <p className="text-sm text-slate-500">Najpierw wybierz produkt w kroku 1.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-4">
                <label className="block min-w-[8rem]">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Ilość</span>
                  <Input
                    density="comfortable"
                    type="number"
                    min={1}
                    step={1}
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                    aria-label="Ilość do produkcji"
                  />
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={reserveMaterials}
                    onChange={(e) => setReserveMaterials(e.target.checked)}
                  />
                  Zarezerwuj materiały przy utworzeniu
                </label>
              </div>
            )}
          </Card>

          <Card variant="section" density="comfortable" className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">3. Podsumowanie</h2>
            {!selected || !preview ? (
              <p className="text-sm text-slate-500">
                {selected ? (previewBusy ? "Obliczanie planu materiałowego…" : "Ustaw ilość, aby zobaczyć podsumowanie.") : "Wybierz produkt i ilość."}
              </p>
            ) : (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-slate-400">Produkt</dt>
                  <dd className="font-medium text-slate-900">{selected.product_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Ilość</dt>
                  <dd className="tabular-nums font-medium text-slate-900">{qty}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Termin</dt>
                  <dd className="tabular-nums text-slate-800">{todayLabel()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Operator</dt>
                  <dd className="text-slate-800">{operatorName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Koszt</dt>
                  <dd className="font-medium text-slate-900">{formatProductionMoney(preview.estimated_cost_net)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Materiały</dt>
                  <dd>
                    {materialsOk ? (
                      <StatusBadge tone="success" density="compact">Dostępne</StatusBadge>
                    ) : (
                      <StatusBadge tone="warning" density="compact">
                        Braki ({preview.shortages.length})
                      </StatusBadge>
                    )}
                  </dd>
                </div>
              </dl>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <PrimaryButton type="button" density="comfortable" disabled={!canSubmit} onClick={() => void submit()}>
                {busy ? "Tworzenie…" : previewBusy ? "Obliczanie…" : "Utwórz zlecenie"}
              </PrimaryButton>
              <Link to={erpProductionPaths.orders} className={secondaryButtonClassName("", "comfortable")}>
                Wróć do listy
              </Link>
            </div>
          </Card>
        </div>

        <div className="space-y-3 xl:col-span-2">
          <Card variant="section" density="comfortable" className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Podgląd materiałów</h2>
            {!selected ? (
              <p className="text-sm text-slate-500">Wybierz produkt, aby zobaczyć zapotrzebowanie z receptury.</p>
            ) : previewBusy && !preview ? (
              <p className="text-sm text-slate-500">Obliczanie…</p>
            ) : preview ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <MetricCard
                    density="compact"
                    label="Koszt"
                    value={formatProductionMoney(preview.estimated_cost_net)}
                    hint="szacunek z receptury"
                  />
                  <MetricCard
                    density="compact"
                    label="Czas"
                    value={formatDurationMinutes(preview.estimated_duration_minutes ?? 0)}
                    hint="przewidywany"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Dostępność materiałów</span>
                    <span className="tabular-nums font-medium text-slate-700">{materialsPct}%</span>
                  </div>
                  <ProgressBar
                    value={materialsPct}
                    tone={materialsOk ? "success" : materialsPct > 0 ? "warning" : "danger"}
                  />
                </div>
                {materialsOk ? (
                  <div className="flex items-start gap-2 text-sm text-emerald-800">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>Wszystkie materiały dostępne.</span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>Wystąpią braki — zlecenie można utworzyć, start będzie zablokowany do uzupełnienia.</span>
                  </div>
                )}
                <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                  {preview.aggregated_components.map((c) => {
                    const tone = stockTone(c.required, c.available);
                    return (
                      <li key={c.component_product_id} className={`rounded-lg border px-3 py-2 text-xs ${STOCK_TONE_CLASS[tone]}`}>
                        <p className="font-semibold text-slate-800">{c.product_name}</p>
                        <p className="text-slate-600">
                          Wymagane: <strong>{c.required}</strong> · Dostępne: {c.available}
                          {c.missing > 0 ? <span className="font-bold text-red-700"> · Brak: {c.missing}</span> : null}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="text-sm text-slate-500">Ustaw ilość, aby przeliczyć materiały.</p>
            )}
          </Card>
          <p className="text-xs text-slate-500">
            Analiza całego magazynu (MRP) jest w zakładce{" "}
            <Link to={erpProductionPaths.planning} className="font-semibold text-slate-700 underline">
              Planowanie
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
