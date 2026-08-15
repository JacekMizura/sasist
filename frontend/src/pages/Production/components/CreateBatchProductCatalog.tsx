import type { RecipeCardRead } from "../../../api/productionApi";
import { ListTile, PrimaryButton, SearchInput, SecondaryButton, typography } from "@/design-system";
import { formatProductionMoney, formatProductionQuantity } from "../productionUi";
import { ProductThumb } from "./ProductThumb";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  recipes: RecipeCardRead[];
  usedCompositionIds: Set<number>;
  lines: { key: string; recipe: RecipeCardRead }[];
  onAdd: (recipe: RecipeCardRead) => void;
  onRemoveLine: (key: string) => void;
};

export function CreateBatchProductCatalog({
  search,
  onSearchChange,
  recipes,
  usedCompositionIds,
  lines,
  onAdd,
  onRemoveLine,
}: Props) {
  return (
    <section className="space-y-2">
      <SearchInput
        density="comfortable"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Szukaj produktu lub receptury…"
        aria-label="Szukaj produktów"
        className="w-full"
      />
      {recipes.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Brak aktywnych receptur produkcyjnych.</p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto pr-0.5">
          {recipes.map((r) => {
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
                        {formatProductionMoney(r.unit_cost_net)}/szt. · max {formatProductionQuantity(r.max_producible)}
                      </p>
                    </div>
                    {added ? (
                      <SecondaryButton
                        type="button"
                        density="compact"
                        onClick={() => {
                          const line = lines.find((l) => l.recipe.composition_id === r.composition_id);
                          if (line) onRemoveLine(line.key);
                        }}
                      >
                        Usuń
                      </SecondaryButton>
                    ) : (
                      <PrimaryButton type="button" density="compact" onClick={() => onAdd(r)}>
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
  );
}
