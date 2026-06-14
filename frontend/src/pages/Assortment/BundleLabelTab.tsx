import { useEffect, useState } from "react";

import api from "../../api/axios";
import { productLikeFieldLabelClass, productLikeInputClass, ProductLikeSection } from "../../components/catalog";
import { openPdfBlobInPrintViewer } from "../../utils/openPdfForBrowserPrint";

type Props = {
  bundleId: number | null;
  tenantId: number;
  isNew: boolean;
};

export function BundleLabelTab({ bundleId, tenantId, isNew }: Props) {
  const [templates, setTemplates] = useState<{ id: number; name: string }[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api
      .get<{ id: number; name: string }[]>("/labels/templates/by-type/product", { params: { tenant_id: tenantId } })
      .then((res) => setTemplates(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTemplates([]));
  }, [tenantId]);

  useEffect(() => {
    if (templateId != null && templates.some((t) => t.id === templateId)) return;
    setTemplateId(templates.length > 0 ? templates[0].id : null);
  }, [templates, templateId]);

  useEffect(() => {
    if (templateId == null) {
      setPreviewSvg(null);
      return;
    }
    setPreviewLoading(true);
    api
      .get<{ svg: string }>(`/label-templates/${templateId}/preview`, { params: { tenant_id: tenantId } })
      .then((res) => setPreviewSvg(res.data?.svg ?? null))
      .catch(() => setPreviewSvg(null))
      .finally(() => setPreviewLoading(false));
  }, [templateId, tenantId]);

  if (isNew) {
    return (
      <ProductLikeSection title="Etykieta">
        <p className="text-sm text-slate-600">Zapisz zestaw, aby wygenerować etykietę.</p>
      </ProductLikeSection>
    );
  }

  const handleGenerate = async () => {
    if (templateId == null || bundleId == null) return;
    setGenerating(true);
    try {
      const res = await api.post(
        "/labels/bundle",
        { bundle_id: bundleId, template_id: templateId, quantity },
        { params: { tenant_id: tenantId }, responseType: "blob" },
      );
      openPdfBlobInPrintViewer(new Blob([res.data], { type: "application/pdf" }));
    } catch {
      window.alert("Nie udało się wygenerować PDF etykiety zestawu.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="w-full xl:max-w-4xl space-y-8">
      <ProductLikeSection title="Szablon etykiety">
        <div className="space-y-5">
          <div>
            <label className={productLikeFieldLabelClass}>Szablon (typ produkt)</label>
            <select
              value={templateId ?? ""}
              onChange={(e) => setTemplateId(e.target.value === "" ? null : Number(e.target.value))}
              className={productLikeInputClass}
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
            <label className={productLikeFieldLabelClass}>Liczba kopii</label>
            <input
              type="number"
              min={1}
              max={500}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              className={productLikeInputClass}
            />
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-5">
            <p className="mb-3 text-sm font-medium text-slate-700">Podgląd szablonu (SVG)</p>
            <div className="flex min-h-[100px] items-center justify-center rounded border border-dashed border-slate-300 bg-white p-2">
              {previewLoading ? (
                <p className="text-xs text-slate-500">Ładowanie…</p>
              ) : previewSvg ? (
                <div className="max-h-36 max-w-full overflow-auto [&_svg]:max-h-36" dangerouslySetInnerHTML={{ __html: previewSvg }} />
              ) : (
                <p className="text-xs text-slate-500">Brak podglądu</p>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={templateId == null || generating}
            onClick={() => void handleGenerate()}
            className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {generating ? "Generowanie…" : "Generuj PDF etykiety"}
          </button>
        </div>
      </ProductLikeSection>
    </div>
  );
}
