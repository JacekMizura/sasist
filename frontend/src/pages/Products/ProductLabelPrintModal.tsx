import { useEffect, useState } from "react";
import api from "../../api/axios";
import { PrimaryButton } from "../../design-system/PrimaryButton";
import { openPdfBlobInPrintViewer } from "../../utils/openPdfForBrowserPrint";
import { AppOverlayPortal } from "../../components/overlay";

export type ProductForLabel = {
  id: number;
  tenant_id?: number;
  label_template_id?: number | null;
};

type Props = {
  product: ProductForLabel | null;
  /** When set, printed label uses this EAN/barcode instead of product.ean. */
  eanOverride?: string | null;
  title?: string;
  onClose: () => void;
};

const DEFAULT_TENANT_ID = 1;

export function ProductLabelPrintModal({
  product,
  eanOverride = null,
  title = "Drukuj etykietę",
  onClose,
}: Props) {
  const [templates, setTemplates] = useState<{ id: number; name: string }[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const tenantId = product?.tenant_id ?? DEFAULT_TENANT_ID;
  const overrideTrimmed = (eanOverride ?? "").trim();

  useEffect(() => {
    if (product == null) return;
    api
      .get<{ id: number; name: string }[]>("/labels/templates/by-type/product", {
        params: { tenant_id: tenantId },
      })
      .then((res) => setTemplates(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTemplates([]));
  }, [product?.id, tenantId]);

  useEffect(() => {
    if (product == null) return;
    setQuantity(1);
    const preferred = product.label_template_id ?? null;
    setTemplateId((prev) => {
      if (preferred != null && templates.some((t) => t.id === preferred)) return preferred;
      if (prev != null && templates.some((t) => t.id === prev)) return prev;
      if (templates.length > 0) return templates[0].id;
      return null;
    });
  }, [product?.id, product?.label_template_id, templates]);

  useEffect(() => {
    if (templateId == null) {
      setPreviewSvg(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    setPreviewSvg(null);
    api
      .get<{ svg: string }>(`/label-templates/${templateId}/preview`, {
        params: { tenant_id: tenantId },
      })
      .then((res) => setPreviewSvg(res.data?.svg ?? null))
      .catch(() => setPreviewSvg(null))
      .finally(() => setPreviewLoading(false));
  }, [templateId, tenantId]);

  if (product == null) return null;

  const handleGenerate = async () => {
    if (templateId == null) return;
    setGenerating(true);
    try {
      const res = await api.post(
        "/labels/product",
        {
          product_id: product.id,
          template_id: templateId,
          quantity,
          ...(overrideTrimmed ? { ean_override: overrideTrimmed } : {}),
        },
        { params: { tenant_id: tenantId }, responseType: "blob" },
      );
      const blob = new Blob([res.data], { type: "application/pdf" });
      openPdfBlobInPrintViewer(blob);
      onClose();
    } catch (err) {
      console.error(err);
      alert("Nie udało się wygenerować PDF. Sprawdź konsolę.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AppOverlayPortal>
      <div className="fixed inset-0 z-[280] flex items-center justify-center bg-black/40" onClick={onClose}>
        <div
          className="mx-4 w-full max-w-md rounded-xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="border-b border-slate-100 px-6 py-4 text-lg font-bold text-slate-800">{title}</h3>
          <div className="space-y-4 p-6">
            {overrideTrimmed ? (
              <p className="rounded-md border border-orange-100 bg-orange-50/50 px-3 py-2 text-xs text-slate-600">
                Kod na etykiecie: <span className="font-mono font-semibold text-slate-900">{overrideTrimmed}</span>
              </p>
            ) : null}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Szablon etykiety</label>
              <select
                value={templateId ?? ""}
                onChange={(e) => setTemplateId(e.target.value === "" ? null : Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">Wybierz szablon</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Podgląd</p>
              <div className="flex min-h-[80px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-3">
                {previewLoading ? (
                  <p className="text-sm text-slate-500">Ładowanie podglądu…</p>
                ) : previewSvg ? (
                  <div
                    className="max-h-40 max-w-full overflow-auto [&_svg]:h-auto [&_svg]:max-h-40 [&_svg]:w-auto"
                    dangerouslySetInnerHTML={{ __html: previewSvg }}
                  />
                ) : (
                  <p className="text-sm text-slate-500">Brak podglądu szablonu</p>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Ilość</label>
              <input
                type="number"
                min={1}
                max={500}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, Math.min(500, Number(e.target.value) || 1)))
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              Anuluj
            </button>
            <PrimaryButton
              type="button"
              density="compact"
              disabled={templateId == null || generating}
              onClick={() => void handleGenerate()}
            >
              {generating ? "Generowanie…" : "Drukuj PDF"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </AppOverlayPortal>
  );
}
