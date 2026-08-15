import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import {
  createProductionBatch,
  getRecipeDetail,
  listRecipeCards,
  previewProductionBatch,
  validateProductionBatchCreateBody,
  type ProductionBatchPreviewRead,
  type RecipeCardRead,
} from "../../../api/productionApi";
import type { DemandBatchLineDraft } from "../../../api/productionPlanningApi";
import { AppOverlayPortal } from "../../../components/overlay";
import {
  Card,
  Dialog,
  Input,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  Stepper,
  typography,
} from "@/design-system";
import {
  computeLineMaterialStatuses,
  type BomRequirement,
  type LineMaterialStatus,
} from "../batchLineMaterialStatus";
import { isFocusedRecommendationEntry, shouldShowProductCatalog } from "../createBatchModalEntry";
import { formatProductionMoney, formatProductionQuantity, stockTone, STOCK_TONE_CLASS } from "../productionUi";
import { CreateBatchProductCatalog } from "./CreateBatchProductCatalog";
import { CreateBatchSummarySection } from "./CreateBatchSummarySection";
import { ProductThumb } from "./ProductThumb";

type LineDraft = {
  key: string;
  recipe: RecipeCardRead;
  quantity: number;
};

type Props = {
  open: boolean;
  tenantId: number;
  warehouseId: number;
  /** Pre-filled lines from demand planning (MRP). */
  initialLines?: DemandBatchLineDraft[];
  onClose: () => void;
  onCreated: (batchId: number) => void;
};

const STEPS = [
  { id: "products", label: "Produkty" },
  { id: "materials", label: "Materiały" },
  { id: "summary", label: "Podsumowanie" },
] as const;

export function CreateBatchModal({ open, tenantId, warehouseId, initialLines, onClose, onCreated }: Props) {
  const [recipes, setRecipes] = useState<RecipeCardRead[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [preview, setPreview] = useState<ProductionBatchPreviewRead | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [reserveMaterials, setReserveMaterials] = useState(false);
  /** When opened from a single recommendation — hide catalog until "Zmień produkt". */
  const [productCatalogOpen, setProductCatalogOpen] = useState(true);
  /** Sticky: single-product recommendation entry (even while catalog is temporarily open). */
  const [fromSingleRecommendation, setFromSingleRecommendation] = useState(false);
  const [bomByCompositionId, setBomByCompositionId] = useState<Record<number, BomRequirement[]>>({});

  const focusedFromRecommendation = isFocusedRecommendationEntry({
    fromSingleRecommendation,
    productCatalogOpen,
    lineCount: lines.length,
  });
  const showProductCatalog = shouldShowProductCatalog({
    fromSingleRecommendation,
    productCatalogOpen,
    lineCount: lines.length,
  });

  const reloadRecipes = useCallback(async () => {
    const rows = await listRecipeCards(tenantId, warehouseId, { activeOnly: true });
    setRecipes(rows);
    return rows;
  }, [tenantId, warehouseId]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const rows = await reloadRecipes();
      if (!initialLines?.length) {
        setLines([]);
        setProductCatalogOpen(true);
        setFromSingleRecommendation(false);
        setBomByCompositionId({});
        return;
      }
      const byComp = new Map(rows.map((r) => [r.composition_id, r]));
      const draft: LineDraft[] = [];
      for (const il of initialLines) {
        const rec = byComp.get(il.composition_id);
        if (!rec) continue;
        draft.push({
          key: `demand-${il.composition_id}`,
          recipe: rec,
          quantity: Math.max(1, Math.ceil(il.planned_quantity)),
        });
      }
      setLines(draft);
      const single = initialLines.length === 1;
      setFromSingleRecommendation(single);
      setProductCatalogOpen(!single);
      setBomByCompositionId({});
    })();
  }, [open, initialLines, reloadRecipes]);

  useEffect(() => {
    if (!open || lines.length === 0) {
      setPreview(null);
      return;
    }
    const draftLines = lines.map((l) => ({
      product_id: l.recipe.product_id,
      composition_id: l.recipe.composition_id,
      planned_quantity: l.quantity,
    }));
    const validation = validateProductionBatchCreateBody(warehouseId, draftLines, {
      reserve_materials: reserveMaterials,
    });
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
          toast.error(extractApiErrorMessage(err, "Nie udało się wygenerować podglądu partii."));
        })
        .finally(() => setPreviewBusy(false));
    }, 300);
    return () => window.clearTimeout(t);
  }, [open, lines, tenantId, warehouseId, reserveMaterials]);

  const compositionIdsKey = lines.map((l) => l.recipe.composition_id).sort((a, b) => a - b).join(",");

  // BOM structure for shared-material attribution (stock still comes only from preview).
  useEffect(() => {
    if (!open || !compositionIdsKey) return;
    const ids = compositionIdsKey.split(",").map(Number).filter((n) => Number.isFinite(n));
    let cancelled = false;
    void (async () => {
      const fetched: Record<number, BomRequirement[]> = {};
      await Promise.all(
        ids.map(async (cid) => {
          try {
            const detail = await getRecipeDetail(tenantId, cid, warehouseId);
            fetched[cid] = detail.components.map((c) => ({
              componentProductId: c.component_product_id,
              requiredPerUnit: c.required_per_unit,
            }));
          } catch {
            /* single-line preview fallback still works without BOM */
          }
        }),
      );
      if (cancelled) return;
      setBomByCompositionId((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const [cidStr, bom] of Object.entries(fetched)) {
          const cid = Number(cidStr);
          if (!bom.length) continue;
          const prevBom = next[cid];
          if (!prevBom?.length) {
            next[cid] = bom;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, compositionIdsKey, tenantId, warehouseId]);

  const filteredRecipes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter(
      (r) =>
        r.product_name.toLowerCase().includes(q) ||
        r.recipe_name.toLowerCase().includes(q) ||
        (r.product_sku ?? "").toLowerCase().includes(q),
    );
  }, [recipes, search]);

  const usedCompositionIds = useMemo(() => new Set(lines.map((l) => l.recipe.composition_id)), [lines]);

  const lineStatuses = useMemo((): Record<string, LineMaterialStatus> => {
    if (!preview) return {};
    return computeLineMaterialStatuses(
      lines.map((l) => ({
        key: l.key,
        compositionId: l.recipe.composition_id,
        plannedQuantity: l.quantity,
      })),
      bomByCompositionId,
      preview.aggregated_components,
    );
  }, [lines, bomByCompositionId, preview]);

  const addLine = (rec: RecipeCardRead) => {
    if (usedCompositionIds.has(rec.composition_id)) return;
    // Recommendation "Zmień produkt": replace the single selected recipe, then collapse catalog.
    if (fromSingleRecommendation && (lines.length === 0 || lines.length === 1)) {
      const keepQty = lines[0]?.quantity;
      setLines([
        {
          key: `demand-${rec.composition_id}`,
          recipe: rec,
          quantity: keepQty ?? Math.max(1, Math.floor(rec.max_producible) || 1),
        },
      ]);
      setProductCatalogOpen(false);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: `l-${rec.composition_id}-${Date.now()}`,
        recipe: rec,
        quantity: Math.max(1, Math.floor(rec.max_producible) || 1),
      },
    ]);
    setFromSingleRecommendation(false);
    setProductCatalogOpen(true);
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((x) => x.key !== key));
  };

  const setLineQuantity = (key: string, quantity: number) => {
    setLines((prev) => prev.map((x) => (x.key === key ? { ...x, quantity: Math.max(1, quantity) } : x)));
  };

  const stepIndex = lines.length === 0 ? 0 : preview ? 2 : 1;

  const payloadValidation = useMemo(() => {
    if (lines.length === 0) return { ok: false as const, message: "" };
    return validateProductionBatchCreateBody(
      warehouseId,
      lines.map((l) => ({
        product_id: l.recipe.product_id,
        composition_id: l.recipe.composition_id,
        planned_quantity: l.quantity,
      })),
      { reserve_materials: reserveMaterials },
    );
  }, [lines, warehouseId, reserveMaterials]);

  const canSubmit = payloadValidation.ok && !busy && !previewBusy && preview != null;
  const submitLabel = focusedFromRecommendation || lines.length === 1 ? "Utwórz zlecenie" : "Utwórz partię";

  const submit = async () => {
    if (!payloadValidation.ok) {
      toast.error(payloadValidation.message);
      return;
    }
    const payload = payloadValidation.body;
    console.log("CREATE_BATCH_PAYLOAD", { tenant_id: tenantId, ...payload });
    setBusy(true);
    try {
      const batch = await createProductionBatch(tenantId, payload);
      toast.success(lines.length === 1 ? "Zlecenie produkcyjne utworzone." : "Partia produkcyjna utworzona.");
      onCreated(batch.id);
      onClose();
      setLines([]);
      setSearch("");
      setPreview(null);
      setProductCatalogOpen(true);
      setFromSingleRecommendation(false);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się utworzyć partii produkcyjnej."));
    } finally {
      setBusy(false);
    }
  };

  const dialogTitle = focusedFromRecommendation ? (
    <span className="block">
      <span className="block text-lg font-semibold tracking-tight text-slate-900">Nowe zlecenie</span>
      <span className={`mt-1 block font-normal ${typography.pageDesc}`}>
        Produkt z rekomendacji — ustaw ilość i sprawdź materiały.
      </span>
    </span>
  ) : (
    <span className="block">
      <span className="block text-lg font-semibold tracking-tight text-slate-900">Nowa partia masowa</span>
      <span className={`mt-1 block font-normal ${typography.pageDesc}`}>
        Dodaj produkty, a system automatycznie obliczy materiały, koszty i dostępność.
      </span>
    </span>
  );

  return (
    <AppOverlayPortal>
      <Dialog
        open={open}
        onClose={onClose}
        size="xl"
        rootClassName="!z-[280]"
        panelClassName="max-h-[85vh]"
        title={dialogTitle}
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <SecondaryButton type="button" onClick={onClose}>
              Anuluj
            </SecondaryButton>
            <PrimaryButton type="button" disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? "Tworzenie…" : previewBusy ? "Obliczanie planu…" : submitLabel}
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-5">
          <Stepper steps={[...STEPS]} activeIndex={stepIndex} />

          {showProductCatalog ? (
            <CreateBatchProductCatalog
              search={search}
              onSearchChange={setSearch}
              recipes={filteredRecipes}
              usedCompositionIds={usedCompositionIds}
              lines={lines}
              onAdd={addLine}
              onRemoveLine={removeLine}
            />
          ) : null}

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className={typography.section}>
                {focusedFromRecommendation ? "Wybrany produkt" : "Wybrane produkty"}
              </h3>
              {focusedFromRecommendation ? (
                <SecondaryButton type="button" density="compact" onClick={() => setProductCatalogOpen(true)}>
                  Zmień produkt
                </SecondaryButton>
              ) : null}
            </div>
            {lines.length === 0 ? (
              <p className="text-sm text-slate-500">Brak dodanych produktów.</p>
            ) : (
              <ul className="space-y-2">
                {lines.map((ln) => {
                  const status = lineStatuses[ln.key];
                  const statusBusy = previewBusy && !status;
                  return (
                    <li key={ln.key}>
                      <Card variant="section" density="compact" className="!p-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <ProductThumb
                            imageUrl={ln.recipe.product_image_url}
                            name={ln.recipe.product_name}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {ln.recipe.product_name}
                            </p>
                            <p className={typography.caption}>
                              {formatProductionMoney(ln.recipe.unit_cost_net)}/szt.
                              {ln.recipe.unit_cost_net != null
                                ? ` · łącznie ${formatProductionMoney(ln.recipe.unit_cost_net * ln.quantity)}`
                                : null}
                            </p>
                            <p className="mt-1">
                              {statusBusy ? (
                                <span className="text-xs text-slate-500">Materiały: przeliczanie…</span>
                              ) : status ? (
                                <StatusBadge tone={status.ok ? "success" : "danger"} density="compact">
                                  {status.label}
                                </StatusBadge>
                              ) : (
                                <span className="text-xs text-slate-500">Materiały: —</span>
                              )}
                            </p>
                          </div>
                          <Input
                            type="number"
                            min={1}
                            density="compact"
                            className="w-24"
                            aria-label={`Ilość ${ln.recipe.product_name}`}
                            value={ln.quantity}
                            onChange={(e) => setLineQuantity(ln.key, Number(e.target.value) || 1)}
                          />
                          {!focusedFromRecommendation ? (
                            <SecondaryButton
                              type="button"
                              density="compact"
                              onClick={() => removeLine(ln.key)}
                              aria-label={`Usuń ${ln.recipe.product_name}`}
                              className="inline-flex items-center gap-1.5"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              Usuń
                            </SecondaryButton>
                          ) : null}
                        </div>

                        {focusedFromRecommendation && preview && preview.aggregated_components.length > 0 ? (
                          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                            {preview.aggregated_components.map((c) => {
                              const ok = c.missing <= 0;
                              const tone = stockTone(c.required, c.available);
                              return (
                                <li
                                  key={c.component_product_id}
                                  className={`flex items-start gap-2 px-3 py-2 text-xs ${STOCK_TONE_CLASS[tone]}`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-slate-800">{c.product_name}</p>
                                    <p className="text-slate-600">
                                      Potrzebne: {formatProductionQuantity(c.required)} · Dostępne:{" "}
                                      {formatProductionQuantity(c.available)}
                                    </p>
                                  </div>
                                  <StatusBadge tone={ok ? "success" : "danger"} density="compact">
                                    {ok ? "Dostępne" : `Brak ${formatProductionQuantity(c.missing)} szt.`}
                                  </StatusBadge>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <CreateBatchSummarySection
            linesEmpty={lines.length === 0}
            previewBusy={previewBusy}
            preview={preview}
            reserveMaterials={reserveMaterials}
            onReserveMaterialsChange={setReserveMaterials}
          />
        </div>
      </Dialog>
    </AppOverlayPortal>
  );
}
