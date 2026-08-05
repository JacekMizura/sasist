import { useCallback, useEffect, useState } from "react";
import { Zap } from "lucide-react";
import toast from "react-hot-toast";

import {
  allocateProductCode,
  previewProductCode,
  type ProductCodeKind,
} from "../../api/productCodesApi";

type Props = {
  kind: ProductCodeKind;
  tenantId: number | null;
  productId?: number | null;
  primaryCategoryId: number | null;
  currentValue: string;
  onGenerated: (value: string) => void;
  label?: string;
};

/**
 * Central SKU / catalog Generuj control — preview + allocate via product-codes API.
 * Does not save the product.
 */
export function ProductCodeGenerateControl({
  kind,
  tenantId,
  productId,
  primaryCategoryId,
  currentValue,
  onGenerated,
  label = "Generuj",
}: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshPreview = useCallback(async () => {
    if (tenantId == null || tenantId < 1) {
      setPreview(null);
      setHint(null);
      return;
    }
    if (primaryCategoryId == null && (productId == null || productId < 1)) {
      setPreview(null);
      setHint(
        kind === "sku"
          ? "Aby wygenerować SKU należy najpierw wybrać kategorię."
          : "Aby wygenerować numer katalogowy należy najpierw wybrać kategorię.",
      );
      return;
    }
    try {
      const res = await previewProductCode({
        tenantId,
        kind,
        categoryId: primaryCategoryId,
        productId: primaryCategoryId == null ? productId : undefined,
      });
      setPreview(res.value);
      setHint(null);
    } catch (e) {
      setPreview(null);
      setHint(e instanceof Error ? e.message : "Nie udało się pobrać podglądu numeracji.");
    }
  }, [tenantId, primaryCategoryId, productId, kind]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  const onClick = async () => {
    if (tenantId == null) return;
    if (primaryCategoryId == null && (productId == null || productId < 1)) {
      toast.error(
        kind === "sku"
          ? "Aby wygenerować SKU należy najpierw wybrać kategorię."
          : "Aby wygenerować numer katalogowy należy najpierw wybrać kategorię.",
      );
      return;
    }
    if (currentValue.trim()) {
      const ok = window.confirm(
        kind === "sku"
          ? `Pole SKU ma już wartość „${currentValue.trim()}”. Wygenerować nowe?`
          : `Numer katalogowy ma już wartość „${currentValue.trim()}”. Wygenerować nowy?`,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await allocateProductCode({
        tenantId,
        kind,
        categoryId: primaryCategoryId,
        productId: primaryCategoryId == null ? productId : undefined,
      });
      onGenerated(res.value);
      // Show next candidate under the button
      void refreshPreview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generowanie nie powiodło się.");
      setHint(e instanceof Error ? e.message : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex shrink-0 flex-col items-stretch gap-0.5">
      <button
        type="button"
        title={kind === "sku" ? "Wygeneruj SKU z kategorii" : "Wygeneruj numer katalogowy z kategorii"}
        disabled={busy || tenantId == null}
        onClick={() => void onClick()}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
      >
        <Zap className="h-3.5 w-3.5 text-amber-500" strokeWidth={2.5} aria-hidden />
        {busy ? "…" : label}
      </button>
      {preview ? (
        <span className="px-0.5 text-[10px] text-slate-500">
          Przykład: <span className="font-mono font-medium text-slate-700">{preview}</span>
        </span>
      ) : hint ? (
        <span className="max-w-[11rem] px-0.5 text-[10px] leading-snug text-amber-700">{hint}</span>
      ) : null}
    </div>
  );
}
