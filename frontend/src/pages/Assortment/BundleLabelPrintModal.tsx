import { useEffect, useState } from "react";
import api from "../../api/axios";
import { openPdfBlobInPrintViewer } from "../../utils/openPdfForBrowserPrint";

type Props = {
  bundleId: number | null;
  tenantId: number;
  onClose: () => void;
};

export function BundleLabelPrintModal({ bundleId, tenantId, onClose }: Props) {
  const [templates, setTemplates] = useState<{ id: number; name: string }[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (bundleId == null) return;
    api
      .get<{ id: number; name: string }[]>("/labels/templates/by-type/product", {
        params: { tenant_id: tenantId },
      })
      .then((res) => setTemplates(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTemplates([]));
  }, [bundleId, tenantId]);

  useEffect(() => {
    if (bundleId == null) return;
    setQuantity(1);
    setTemplateId((prev) => {
      if (prev != null && templates.some((t) => t.id === prev)) return prev;
      if (templates.length > 0) return templates[0].id;
      return null;
    });
  }, [bundleId, templates]);

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

  if (bundleId == null) return null;

  const handleGenerate = async () => {
    if (templateId == null) return;
    setGenerating(true);
    try {
      const res = await api.post(
        "/labels/bundle",
        { bundle_id: bundleId, template_id: templateId, quantity },
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
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="border-b border-slate-100 px-6 py-4 text-lg font-bold text-slate-800">Drukuj etykietę zestawu</h3>
        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Szablon etykiety (typ produkt)</label>
            <select
              value={templateId ?? ""}
              onChange={(e) => setTemplateId(e.target.value === "" ? null : Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:border-violet-400 focus:ring-2 focus:ring-violet-500"
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
            <label className="mb-1 block text-sm font-medium text-slate-700">Liczba kopii</label>
            <input
              type="number"
              min={1}
              max={500}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Podgląd szablonu</p>
            <div className="flex min-h-[80px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-3">
              {previewLoading ? (
                <p className="text-sm text-slate-500">Ładowanie podglądu…</p>
              ) : previewSvg ? (
                <div
                  className="max-h-40 max-w-full overflow-auto [&_svg]:max-h-40 [&_svg]:h-auto [&_svg]:w-auto"
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />
              ) : (
                <p className="text-sm text-slate-500">Brak podglądu</p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              Anuluj
            </button>
            <button
              type="button"
              disabled={templateId == null || generating}
              onClick={() => void handleGenerate()}
              className="rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {generating ? "Generowanie…" : "Generuj PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
