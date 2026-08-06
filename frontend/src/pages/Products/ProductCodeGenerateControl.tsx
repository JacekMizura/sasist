import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
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

/** Same chrome as EAN „Generuj” on ProductEditBasicTab. */
const generateBtnClass =
  "inline-flex h-full shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50";

function categoryRequiredMessage(kind: ProductCodeKind): string {
  return kind === "sku"
    ? "Aby wygenerować SKU należy najpierw wybrać kategorię."
    : "Aby wygenerować numer katalogowy należy najpierw wybrać kategorię.";
}

/**
 * Central SKU / catalog Generuj control — preview + allocate via product-codes API.
 * Category-required message only via toast on click (no permanent under-button hint).
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
  const [busy, setBusy] = useState(false);

  const refreshPreview = useCallback(async () => {
    if (tenantId == null || tenantId < 1) {
      setPreview(null);
      return;
    }
    if (primaryCategoryId == null && (productId == null || productId < 1)) {
      setPreview(null);
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
    } catch {
      setPreview(null);
    }
  }, [tenantId, primaryCategoryId, productId, kind]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  const onClick = async () => {
    if (tenantId == null) return;
    if (primaryCategoryId == null && (productId == null || productId < 1)) {
      toast.error(categoryRequiredMessage(kind));
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
      void refreshPreview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generowanie nie powiodło się.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex shrink-0 self-stretch">
      <button
        type="button"
        title={kind === "sku" ? "Wygeneruj SKU z kategorii" : "Wygeneruj numer katalogowy z kategorii"}
        disabled={busy || tenantId == null}
        onClick={() => void onClick()}
        className={generateBtnClass}
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {busy ? "…" : label}
      </button>
      {preview ? (
        <span className="absolute left-0 top-full z-10 mt-0.5 whitespace-nowrap px-0.5 text-[10px] text-slate-500">
          Przykład: <span className="font-mono font-medium text-slate-700">{preview}</span>
        </span>
      ) : null}
    </div>
  );
}
