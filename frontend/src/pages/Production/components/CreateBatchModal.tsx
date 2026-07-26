import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import {
  createProductionBatch,
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
  Checkbox,
  Dialog,
  Input,
  ListTile,
  PrimaryButton,
  SearchInput,
  SecondaryButton,
  StatusBadge,
  Stepper,
  typography,
} from "@/design-system";
import { formatProductionMoney, stockTone, STOCK_TONE_CLASS } from "../productionUi";
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

  const addLine = (rec: RecipeCardRead) => {
    if (usedCompositionIds.has(rec.composition_id)) return;
    setLines((prev) => [
      ...prev,
      {
        key: `l-${rec.composition_id}-${Date.now()}`,
        recipe: rec,
        quantity: Math.max(1, Math.floor(rec.max_producible) || 1),
      },
    ]);
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
      toast.success("Partia produkcyjna utworzona.");
      onCreated(batch.id);
      onClose();
      setLines([]);
      setSearch("");
      setPreview(null);
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, "Nie udało się utworzyć partii produkcyjnej."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppOverlayPortal>
      <Dialog
        open={open}
        onClose={onClose}
        size="xl"
        rootClassName="!z-[280]"
        panelClassName="max-h-[85vh]"
        title={
          <span className="block">
            <span className="block text-lg font-semibold tracking-tight text-slate-900">Nowa partia masowa</span>
            <span className={`mt-1 block font-normal ${typography.pageDesc}`}>
              Dodaj produkty, a system automatycznie obliczy materiały, koszty i dostępność.
            </span>
          </span>
        }
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <SecondaryButton type="button" onClick={onClose}>
              Anuluj
            </SecondaryButton>
            <PrimaryButton type="button" disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? "Tworzenie partii…" : previewBusy ? "Obliczanie planu…" : "Utwórz partię"}
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-5">
          <Stepper steps={[...STEPS]} activeIndex={stepIndex} />

          <section className="space-y-2">
            <SearchInput
              density="comfortable"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj produktu lub receptury…"
              aria-label="Szukaj produktów"
              className="w-full"
            />
            {filteredRecipes.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Brak aktywnych receptur produkcyjnych.</p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto pr-0.5">
                {filteredRecipes.map((r) => {
                  const added = usedCompositionIds.has(r.composition_id);
                  return (
                    <li key={r.composition_id}>
                      <ListTile density="compact" className="w-full">
                        <div className="flex items-center gap-3">
                          <ProductThumb imageUrl={r.product_image_url} name={r.product_name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{r.product_name}</p>
                            <p className="truncate font-mono text-xs text-slate-500">{r.product_sku ?? "—"}</p>
                            <p className={`mt-0.5 ${typography.caption}`}>
                              {formatProductionMoney(r.unit_cost_net)}/szt. · max {Math.floor(r.max_producible)}
                            </p>
                          </div>
                          {added ? (
                            <SecondaryButton type="button" density="compact" onClick={() => {
                              const line = lines.find((l) => l.recipe.composition_id === r.composition_id);
                              if (line) removeLine(line.key);
                            }}>
                              Usuń
                            </SecondaryButton>
                          ) : (
                            <PrimaryButton type="button" density="compact" onClick={() => addLine(r)}>
                              Dodaj
                            </PrimaryButton>
                          )}
                        </div>
                      </ListTile>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className={typography.section}>Wybrane produkty</h3>
            {lines.length === 0 ? (
              <p className="text-sm text-slate-500">Brak dodanych produktów.</p>
            ) : (
              <ul className="space-y-2">
                {lines.map((ln) => (
                  <li key={ln.key}>
                    <Card variant="section" density="compact" className="!p-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <ProductThumb imageUrl={ln.recipe.product_image_url} name={ln.recipe.product_name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{ln.recipe.product_name}</p>
                          <p className={typography.caption}>
                            {formatProductionMoney(ln.recipe.unit_cost_net)}/szt.
                            {ln.recipe.unit_cost_net != null
                              ? ` · łącznie ${formatProductionMoney(ln.recipe.unit_cost_net * ln.quantity)}`
                              : null}
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
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h3 className={typography.section}>Podsumowanie</h3>
            <Card variant="section" density="comfortable" className="space-y-3">
              {lines.length === 0 ? (
                <p className="text-sm text-slate-500">Dodaj produkty, aby zobaczyć podsumowanie materiałów i kosztów.</p>
              ) : previewBusy && !preview ? (
                <p className="text-sm text-slate-500">Obliczanie planu materiałowego…</p>
              ) : preview ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SummaryStat label="Produkty" value={preview.products_count} />
                    <SummaryStat label="Łączna liczba sztuk" value={preview.total_planned_units} />
                    <SummaryStat label="Szacowany koszt" value={formatProductionMoney(preview.estimated_cost_net)} />
                    <SummaryStat label="Wymagane materiały" value={preview.aggregated_components.length} />
                  </div>

                  {preview.has_shortages ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                      <p className="flex items-center gap-2 font-semibold">
                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                        Braki materiałów ({preview.shortages.length})
                      </p>
                      <p className="mt-1 text-xs text-amber-800">
                        Partię można utworzyć, ale start produkcji będzie zablokowany do uzupełnienia stanów.
                      </p>
                    </div>
                  ) : (
                    <StatusBadge tone="success" density="comfortable">
                      Materiały wystarczające
                    </StatusBadge>
                  )}

                  {preview.aggregated_components.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className={typography.caption}>Zagregowane materiały</p>
                      <ul className="max-h-40 space-y-1.5 overflow-y-auto">
                        {preview.aggregated_components.map((c) => {
                          const tone = stockTone(c.required, c.available);
                          return (
                            <li
                              key={c.component_product_id}
                              className={`rounded-md border px-3 py-2 text-xs ${STOCK_TONE_CLASS[tone]}`}
                            >
                              <p className="font-semibold text-slate-800">{c.product_name}</p>
                              <p className="text-slate-600">
                                Wymagane: <strong>{c.required}</strong> · Dostępne: {c.available}
                                {c.missing > 0 ? (
                                  <span className="font-bold text-red-700"> · Brak: {c.missing}</span>
                                ) : null}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-500">Obliczanie planu materiałowego…</p>
              )}

              <label className="flex cursor-pointer items-center gap-2 border-t border-slate-100 pt-3 text-sm text-slate-800">
                <Checkbox
                  checked={reserveMaterials}
                  onChange={(e) => setReserveMaterials(e.target.checked)}
                />
                Rezerwuj materiały przy utworzeniu partii
              </label>
            </Card>
          </section>
        </div>
      </Dialog>
    </AppOverlayPortal>
  );
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className={typography.kpiLabel}>{label}</p>
      <p className={`mt-1 ${typography.metric}`}>{value}</p>
    </div>
  );
}
