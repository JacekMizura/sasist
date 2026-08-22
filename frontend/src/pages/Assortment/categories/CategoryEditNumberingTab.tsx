import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import {
  updateProductCategory,
  type ProductCategoryRead,
} from "../../../api/productCategoriesApi";
import { previewProductCode } from "../../../api/productCodesApi";
import { extractApiErrorMessage } from "../../../api/authApi";
import {
  FormField,
  FormHelperText,
  FormSection,
  FORM_FIELD_DENSITY,
  Input,
  PrimaryButton,
} from "../../../design-system";
import { pimStatTileClass } from "../pimUi";

const DEFAULT_TPL = "{CODE}-{NNNNN}";

type Props = {
  tenantId: number;
  category: ProductCategoryRead;
  onSaved: (next: ProductCategoryRead) => void;
};

type PreviewState = {
  value: string | null;
  sequence_n: number | null;
  error: string | null;
};

/**
 * SKU / catalog numbering with live product_codes preview.
 */
export function CategoryEditNumberingTab({ tenantId, category, onSaved }: Props) {
  const [skuCode, setSkuCode] = useState(category.sku_code ?? "");
  const [catalogCode, setCatalogCode] = useState(category.catalog_code ?? "");
  const [skuTemplate, setSkuTemplate] = useState(category.sku_template?.trim() || DEFAULT_TPL);
  const [catalogTemplate, setCatalogTemplate] = useState(
    category.catalog_template?.trim() || DEFAULT_TPL,
  );
  const [skuPreview, setSkuPreview] = useState<PreviewState>({ value: null, sequence_n: null, error: null });
  const [catalogPreview, setCatalogPreview] = useState<PreviewState>({
    value: null,
    sequence_n: null,
    error: null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSkuCode(category.sku_code ?? "");
    setCatalogCode(category.catalog_code ?? "");
    setSkuTemplate(category.sku_template?.trim() || DEFAULT_TPL);
    setCatalogTemplate(category.catalog_template?.trim() || DEFAULT_TPL);
  }, [category]);

  const refreshPreviews = useCallback(async () => {
    const load = async (kind: "sku" | "catalog") => {
      try {
        const r = await previewProductCode({
          tenantId,
          kind,
          categoryId: category.id,
        });
        return { value: r.value, sequence_n: r.sequence_n, error: null as string | null };
      } catch (e) {
        return {
          value: null,
          sequence_n: null,
          error: extractApiErrorMessage(e, "Brak konfiguracji numeracji"),
        };
      }
    };
    const [s, c] = await Promise.all([load("sku"), load("catalog")]);
    setSkuPreview(s);
    setCatalogPreview(c);
  }, [tenantId, category.id]);

  useEffect(() => {
    void refreshPreviews();
  }, [refreshPreviews, category.sku_code, category.catalog_code, category.sku_template, category.catalog_template]);

  const onSave = async () => {
    setSaving(true);
    try {
      const updated = await updateProductCategory({
        tenantId,
        categoryId: category.id,
        body: {
          sku_code: skuCode.trim().toUpperCase() || null,
          catalog_code: catalogCode.trim().toUpperCase() || null,
          sku_template: skuTemplate.trim() || DEFAULT_TPL,
          catalog_template: catalogTemplate.trim() || DEFAULT_TPL,
        },
      });
      onSaved(updated);
      toast.success("Zapisano numerację.");
      await refreshPreviews();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, "Nie udało się zapisać numeracji."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <FormSection
        title="Numeracja SKU i katalogowa"
        description="Liczniki są osobne per prefiks/szablon. Podgląd pochodzi z centralnego serwisu product_codes."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Kod SKU">
            <Input
              value={skuCode}
              onChange={(e) => setSkuCode(e.target.value.toUpperCase())}
              className="font-mono"
              placeholder="np. SZN"
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
            />
          </FormField>
          <FormField label="Kod numeru katalogowego">
            <Input
              value={catalogCode}
              onChange={(e) => setCatalogCode(e.target.value.toUpperCase())}
              className="font-mono"
              placeholder="np. SZN"
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
            />
          </FormField>
          <FormField label="Szablon SKU">
            <Input
              value={skuTemplate}
              onChange={(e) => setSkuTemplate(e.target.value)}
              className="font-mono text-xs"
              placeholder="{CODE}-{NNNNN}"
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
            />
          </FormField>
          <FormField label="Szablon numeru katalogowego">
            <Input
              value={catalogTemplate}
              onChange={(e) => setCatalogTemplate(e.target.value)}
              className="font-mono text-xs"
              placeholder="{CODE}-{NNNNN}"
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
            />
          </FormField>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={pimStatTileClass}>
            <dt className="text-xs text-slate-500">Następny SKU</dt>
            <dd className="font-mono text-sm font-semibold text-slate-900">
              {skuPreview.value || "—"}
            </dd>
            {skuPreview.sequence_n != null ? (
              <p className="mt-1 text-[11px] text-slate-500">
                Licznik (następny n): {skuPreview.sequence_n} · poprzedni:{" "}
                {Math.max(0, skuPreview.sequence_n - 1)}
              </p>
            ) : null}
            {skuPreview.error ? <p className="mt-1 text-[11px] text-amber-700">{skuPreview.error}</p> : null}
          </div>
          <div className={pimStatTileClass}>
            <dt className="text-xs text-slate-500">Następny numer katalogowy</dt>
            <dd className="font-mono text-sm font-semibold text-slate-900">
              {catalogPreview.value || "—"}
            </dd>
            {catalogPreview.sequence_n != null ? (
              <p className="mt-1 text-[11px] text-slate-500">
                Licznik (następny n): {catalogPreview.sequence_n} · poprzedni:{" "}
                {Math.max(0, catalogPreview.sequence_n - 1)}
              </p>
            ) : null}
            {catalogPreview.error ? (
              <p className="mt-1 text-[11px] text-amber-700">{catalogPreview.error}</p>
            ) : null}
          </div>
        </dl>

        <FormHelperText className="mt-3">
          Tokeny: <code className="font-mono">{"{CODE}"}</code>, <code className="font-mono">{"{NNNNN}"}</code>.
          Zapisz, aby podgląd odświeżył się z zapisanej konfiguracji.
        </FormHelperText>
      </FormSection>

      <PrimaryButton type="button" density="compact" disabled={saving} onClick={() => void onSave()}>
        {saving ? "Zapisywanie…" : "Zapisz numerację"}
      </PrimaryButton>
    </div>
  );
}
