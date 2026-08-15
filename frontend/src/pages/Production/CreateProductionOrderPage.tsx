import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import {
  createProductionBatch,
  listRecipeCards,
  previewProductionBatch,
  validateProductionBatchCreateBody,
  type BatchAggregatedPickLineRead,
  type ProductionBatchPreviewRead,
  type RecipeCardRead,
} from "@/api/productionApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { useActiveWarehouseContext } from "@/hooks/useActiveWarehouseContext";
import { ActiveWarehouseRequiredBanner } from "@/components/layout/ActiveWarehouseRequiredBanner";
import { SettingInfoButton } from "../Settings/SettingInfoButton";
import { ProductThumb } from "./components/ProductThumb";
import { RecommendedProductionTiles } from "./components/RecommendedProductionTiles";
import {
  coverageAfterProductionDays,
  useProductMrpRecommendations,
  type HorizonKey,
  type HorizonTile,
} from "./hooks/useProductMrpRecommendations";
import { formatDurationMinutes } from "./productionTheme";
import { formatProductionMoney, formatProductionQuantity, stockTone } from "./productionUi";
import { erpProductionPaths } from "./productionPaths";
import { productionPageStackClass, productionPageTitleClass } from "./productionLayoutTokens";
import {
  Card,
  Input,
  ListTile,
  PageHeader,
  PrimaryButton,
  SearchInput,
  StatusBadge,
  Stepper,
  secondaryButtonClassName,
} from "@/design-system";

const DEFAULT_TENANT = 1;

const STEPS = [
  { id: "product", label: "Produkt", description: "Co produkujemy" },
  { id: "qty", label: "Ilość i realizacja", description: "Skład i dostępność" },
  { id: "summary", label: "Podsumowanie", description: "Utwórz zlecenie" },
] as const;

function todayLabel(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function formatCoverageDays(days: number | null): string {
  if (days == null || !Number.isFinite(days)) return "—";
  return `${Math.round(days)} dni`;
}

function materialsSummaryLabel(components: BatchAggregatedPickLineRead[]): {
  label: string;
  tone: "success" | "danger" | "neutral";
  coveragePct: number | null;
} {
  if (components.length === 0) return { label: "Brak składników", tone: "neutral", coveragePct: null };
  const short = components.filter((c) => c.missing > 0).length;
  const coveragePct = Math.round(((components.length - short) / components.length) * 100);
  if (short === 0) return { label: "Materiały: komplet", tone: "success", coveragePct };
  if (short === 1) return { label: "Brakuje 1 składnika", tone: "danger", coveragePct };
  return { label: `Brakuje ${short} składników`, tone: "danger", coveragePct };
}

function RecipeComponentsList({
  components,
  qty,
  busy,
}: {
  components: BatchAggregatedPickLineRead[];
  qty: number;
  busy?: boolean;
}) {
  if (busy && components.length === 0) {
    return <p className="text-sm text-slate-500">Przeliczanie składu receptury…</p>;
  }
  if (components.length === 0) {
    return <p className="text-sm text-slate-500">Brak danych o składzie receptury.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {components.map((c) => {
        const perUnit = qty > 0 ? c.required / qty : c.required;
        const ok = c.missing <= 0;
        const tone = stockTone(c.required, c.available);
        return (
          <li key={c.component_product_id} className="flex items-start gap-3 px-3 py-2.5">
            <ProductThumb imageUrl={c.product_image_url} name={c.product_name} size="sm" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{c.product_name}</p>
                  <p className="truncate font-mono text-[11px] text-slate-500">{c.product_sku || "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <StatusBadge tone={ok ? "success" : "danger"} density="compact">
                    {ok ? "Dostępne" : `Brak ${formatProductionQuantity(c.missing)} szt.`}
                  </StatusBadge>
                  {!ok ? (
                    <SettingInfoButton
                      title="Brak materiałów"
                      description={
                        <ul>
                          <li>
                            Brakuje jednego lub kilku komponentów potrzebnych do wykonania pełnej
                            rekomendowanej ilości.
                          </li>
                          <li>
                            Produkcja może być ograniczona do ilości możliwej przy aktualnie dostępnych
                            materiałach.
                          </li>
                        </ul>
                      }
                      tip={
                        <p>
                          Sprawdź zakładkę Materiały, aby zobaczyć konkretne niedobory i źródła
                          zapotrzebowania.
                        </p>
                      }
                    />
                  ) : null}
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-[11px] text-slate-600 sm:grid-cols-3">
                <div>
                  <dt className="text-slate-400">Na 1 szt.</dt>
                  <dd className="font-semibold tabular-nums text-slate-800">
                    {formatProductionQuantity(perUnit)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Potrzebne</dt>
                  <dd className="font-semibold tabular-nums text-slate-800">
                    {formatProductionQuantity(c.required)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Dostępne</dt>
                  <dd
                    className={`font-semibold tabular-nums ${
                      tone === "short" ? "text-rose-700" : "text-slate-800"
                    }`}
                  >
                    {formatProductionQuantity(c.available)}
                  </dd>
                </div>
              </dl>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function CreateProductionOrderPage() {
  const navigate = useNavigate();
  const { warehouseId, hasActiveWarehouse } = useActiveWarehouseContext();
  const tenantId = DEFAULT_TENANT;

  const [recipes, setRecipes] = useState<RecipeCardRead[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RecipeCardRead | null>(null);
  const [qty, setQty] = useState(1);
  const [activeHorizon, setActiveHorizon] = useState<HorizonKey | null>(null);
  const [preview, setPreview] = useState<ProductionBatchPreviewRead | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reserveMaterials, setReserveMaterials] = useState(false);
  const autoHorizonForProductRef = useRef<number | null>(null);

  const mrp = useProductMrpRecommendations(
    tenantId,
    warehouseId,
    selected?.product_id ?? null,
    selected?.max_producible ?? null,
  );

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
        (r.product_sku ?? "").toLowerCase().includes(q),
    );
  }, [recipes, search]);

  useEffect(() => {
    if (!selected || mrp.loading || mrp.tiles.length === 0) return;
    if (autoHorizonForProductRef.current === selected.product_id) return;
    autoHorizonForProductRef.current = selected.product_id;
    const preferred =
      mrp.tiles.find((t) => t.key === "7" && t.quantity != null) ??
      mrp.tiles.find((t) => t.quantity != null);
    if (preferred?.quantity != null) {
      setActiveHorizon(preferred.key);
      setQty(preferred.quantity);
    }
  }, [selected, mrp.loading, mrp.tiles]);

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
      { reserve_materials: reserveMaterials },
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
      { reserve_materials: reserveMaterials },
    );
  }, [selected, warehouseId, qty, reserveMaterials]);

  const canSubmit = payloadValidation.ok && !busy && !previewBusy && preview != null;

  const selectRecipe = (r: RecipeCardRead) => {
    setSelected(r);
    setActiveHorizon(null);
    setQty(1);
    autoHorizonForProductRef.current = null;
  };

  const applyHorizonTile = (tile: HorizonTile) => {
    if (tile.quantity == null) return;
    setActiveHorizon(tile.key);
    setQty(tile.quantity);
  };

  const onQtyManualChange = (raw: string) => {
    setActiveHorizon(null);
    setQty(Math.max(1, Math.floor(Number(raw) || 1)));
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

  const components = preview?.aggregated_components ?? [];
  const materials = materialsSummaryLabel(components);
  const coverageLabel = formatCoverageDays(coverageAfterProductionDays(mrp.demandRow, qty));
  const operatorDisplay = "Dowolny operator";

  const stickySummary = selected ? (
    <Card variant="section" density="comfortable" className="space-y-3 xl:sticky xl:top-4">
      <h2 className="text-sm font-semibold text-slate-900">Podsumowanie</h2>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Produkt</dt>
          <dd className="font-medium text-slate-900">{selected.product_name}</dd>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <dt className="text-xs text-slate-500">Ilość</dt>
            <dd className="tabular-nums font-medium text-slate-900">
              {formatProductionQuantity(qty)} szt.
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Termin</dt>
            <dd className="tabular-nums text-slate-800">{todayLabel()}</dd>
          </div>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Operator</dt>
          <dd className="text-slate-800">{operatorDisplay}</dd>
        </div>
        {preview ? (
          <>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
              <div>
                <dt className="text-xs text-slate-500">Koszt</dt>
                <dd className="font-medium text-slate-900">
                  {formatProductionMoney(preview.estimated_cost_net)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Czas</dt>
                <dd className="text-slate-800">
                  {formatDurationMinutes(preview.estimated_duration_minutes ?? 0)}
                </dd>
              </div>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Materiały</dt>
              <dd className="flex flex-wrap items-center gap-1.5">
                <StatusBadge tone={materials.tone} density="compact">
                  {materials.label}
                </StatusBadge>
                {materials.coveragePct != null ? (
                  <span className="text-xs text-slate-500">
                    Pokrycie materiałów: {materials.coveragePct}%
                  </span>
                ) : null}
              </dd>
            </div>
            {coverageLabel !== "—" ? (
              <div>
                <dt className="text-xs text-slate-500">Pokrycie zapasu po produkcji</dt>
                <dd className="text-slate-800">{coverageLabel}</dd>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-slate-500">
            {previewBusy ? "Obliczanie materiałów…" : "Ustaw ilość, aby przeliczyć skład."}
          </p>
        )}
      </dl>
      <PrimaryButton
        type="button"
        density="comfortable"
        className="w-full"
        disabled={!canSubmit}
        onClick={() => void submit()}
      >
        {busy ? "Tworzenie…" : previewBusy ? "Obliczanie…" : "Utwórz zlecenie"}
      </PrimaryButton>
    </Card>
  ) : (
    <Card variant="section" density="comfortable">
      <p className="text-sm text-slate-500">Wybierz produkt, aby zobaczyć podsumowanie.</p>
    </Card>
  );

  return (
    <div className={productionPageStackClass}>
      <PageHeader
        title={<h1 className={productionPageTitleClass}>Nowe zlecenie produkcyjne</h1>}
        actions={
          <Link to={erpProductionPaths.orders} className={secondaryButtonClassName()}>
            Anuluj
          </Link>
        }
      >
        <div className="space-y-4">
          <Card variant="section" density="comfortable">
            <Stepper steps={[...STEPS]} activeIndex={activeStep} />
          </Card>

          <div className="grid gap-4 xl:grid-cols-5">
            <div className="space-y-4 xl:col-span-3">
              {/* KROK 1 — Produkt */}
              <Card variant="section" density="comfortable" className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">1. Produkt</h2>
                  {selected ? (
                    <StatusBadge tone="success" density="compact">
                      Wybrano
                    </StatusBadge>
                  ) : null}
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
                  <ul className="max-h-56 space-y-2 overflow-y-auto sm:max-h-64">
                    {filtered.map((r) => {
                      const active = selected?.composition_id === r.composition_id;
                      return (
                        <li key={r.composition_id}>
                          <button type="button" className="w-full text-left" onClick={() => selectRecipe(r)}>
                            <ListTile
                              selected={active}
                              density="compact"
                              className="transition hover:border-slate-300"
                            >
                              <div className="flex items-center gap-3">
                                <ProductThumb
                                  imageUrl={r.product_image_url}
                                  name={r.product_name}
                                  size="sm"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {r.product_name}
                                  </p>
                                  <p className="truncate text-xs text-slate-500">
                                    {r.product_sku || "—"} · {r.recipe_name}
                                  </p>
                                </div>
                                <span className="shrink-0 tabular-nums text-xs text-slate-500">
                                  stan {formatProductionQuantity(r.current_stock)}
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
                      <ProductThumb
                        imageUrl={selected.product_image_url}
                        name={selected.product_name}
                        size="md"
                      />
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
                          <dt className="text-slate-400">Stan</dt>
                          <dd className="tabular-nums text-slate-800">
                            {formatProductionQuantity(selected.current_stock)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-400">Receptura</dt>
                          <dd className="truncate text-slate-800">
                            {selected.recipe_name} (v{selected.version})
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                ) : null}
              </Card>

              {/* KROK 2 — Ilość i realizacja */}
              <Card variant="section" density="comfortable" className="space-y-4">
                <h2 className="text-sm font-semibold text-slate-900">2. Ilość i realizacja</h2>
                {!selected ? (
                  <p className="text-sm text-slate-500">Najpierw wybierz produkt.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-end gap-4">
                      <label className="block min-w-[8rem]">
                        <span className="mb-1 block text-xs font-medium text-slate-500">Ilość</span>
                        <Input
                          density="comfortable"
                          type="number"
                          min={1}
                          step={1}
                          value={qty}
                          onChange={(e) => onQtyManualChange(e.target.value)}
                          aria-label="Ilość do produkcji"
                        />
                      </label>
                      <div className="min-w-[12rem] flex-1">
                        <div className="mb-1 flex items-center gap-1.5">
                          <span className="text-xs font-medium text-slate-500">Operator</span>
                          <SettingInfoButton
                            title="Operator zlecenia"
                            description={
                              <ul>
                                <li>
                                  Przypisanie zlecenia do konkretnego operatora nie jest jeszcze dostępne.
                                </li>
                                <li>
                                  Historia pokazuje obecnie osobę, która utworzyła dokument — nie osobę
                                  odpowiedzialną za realizację.
                                </li>
                                <li>
                                  Do czasu rozszerzenia systemu nowe zlecenia pozostają dostępne dla
                                  wszystkich uprawnionych operatorów.
                                </li>
                              </ul>
                            }
                            tip={
                              <p>
                                Gdy pojawi się przypisanie operatora w API, w tym miejscu będzie można
                                wybrać konkretną osobę lub pozostawić zlecenie nieprzypisane.
                              </p>
                            }
                          />
                        </div>
                        <Input
                          density="comfortable"
                          value={operatorDisplay}
                          readOnly
                          disabled
                          aria-label="Operator"
                          className="w-full"
                        />
                        <p className="mt-1 text-[11px] leading-snug text-slate-500">
                          Jeśli nie wybierzesz operatora, zlecenie będzie dostępne dla wszystkich
                          uprawnionych operatorów.
                        </p>
                      </div>
                      <div className="min-w-[9rem]">
                        <span className="mb-1 block text-xs font-medium text-slate-500">Termin</span>
                        <Input density="comfortable" value={todayLabel()} readOnly disabled />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={reserveMaterials}
                        onChange={(e) => setReserveMaterials(e.target.checked)}
                      />
                      Zarezerwuj materiały przy utworzeniu
                    </label>

                    <RecommendedProductionTiles
                      tiles={mrp.tiles}
                      loading={mrp.loading}
                      activeKey={activeHorizon}
                      onSelect={applyHorizonTile}
                    />

                    <div className="space-y-2 border-t border-slate-100 pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">Skład receptury</h3>
                        {preview ? (
                          <StatusBadge tone={materials.tone} density="compact">
                            {materials.label}
                          </StatusBadge>
                        ) : null}
                      </div>
                      <p className={`text-xs text-slate-500`}>
                        Ilości składników przeliczają się automatycznie przy zmianie ilości produkcji (
                        {formatProductionQuantity(qty)} szt.).
                      </p>
                      <RecipeComponentsList
                        components={components}
                        qty={qty}
                        busy={previewBusy}
                      />
                    </div>
                  </>
                )}
              </Card>

              {/* KROK 3 — Podsumowanie (mobile / below) */}
              <Card variant="section" density="comfortable" className="space-y-3 xl:hidden">
                <h2 className="text-sm font-semibold text-slate-900">3. Podsumowanie</h2>
                {!selected || !preview ? (
                  <p className="text-sm text-slate-500">
                    {selected
                      ? previewBusy
                        ? "Obliczanie planu materiałowego…"
                        : "Ustaw ilość, aby zobaczyć podsumowanie."
                      : "Wybierz produkt i ilość."}
                  </p>
                ) : (
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500">Produkt</dt>
                      <dd className="font-medium text-slate-900">{selected.product_name}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Ilość</dt>
                      <dd className="tabular-nums font-medium text-slate-900">
                        {formatProductionQuantity(qty)} szt.
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Operator</dt>
                      <dd className="text-slate-800">{operatorDisplay}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Termin</dt>
                      <dd className="tabular-nums text-slate-800">{todayLabel()}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Koszt</dt>
                      <dd className="font-medium text-slate-900">
                        {formatProductionMoney(preview.estimated_cost_net)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Materiały</dt>
                      <dd>
                        <StatusBadge tone={materials.tone} density="compact">
                          {materials.label}
                        </StatusBadge>
                      </dd>
                    </div>
                  </dl>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <PrimaryButton
                    type="button"
                    density="comfortable"
                    disabled={!canSubmit}
                    onClick={() => void submit()}
                  >
                    {busy ? "Tworzenie…" : previewBusy ? "Obliczanie…" : "Utwórz zlecenie"}
                  </PrimaryButton>
                  <Link
                    to={erpProductionPaths.orders}
                    className={secondaryButtonClassName("", "comfortable")}
                  >
                    Wróć do listy
                  </Link>
                </div>
              </Card>
            </div>

            <div className="hidden space-y-3 xl:col-span-2 xl:block">{stickySummary}</div>
          </div>
        </div>
      </PageHeader>
    </div>
  );
}
