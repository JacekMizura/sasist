import { useEffect, useState } from "react";
import api from "../../api/axios";
import { openPdfBlobInPrintViewer } from "../../utils/openPdfForBrowserPrint";

export type CartForLabel = { id: number; name: string };

type Props = {
  open: boolean;
  cart: CartForLabel | null;
  onClose: () => void;
};

const TENANT_ID = 1;

export function CartLabelPrintModal({ open, cart, onClose }: Props) {
  const [templates, setTemplates] = useState<{ id: number; name: string }[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open) return;
    api
      .get<{ id: number; name: string }[]>("/labels/templates/by-type/cart", { params: { tenant_id: TENANT_ID } })
      .then((res) => setTemplates(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTemplates([]));
  }, [open]);

  useEffect(() => {
    if (!open || !cart) return;
    setQuantity(1);
    setTemplateId((prev) => {
      if (templates.length > 0 && (prev == null || !templates.some((t) => t.id === prev)))
        return templates[0].id;
      return prev;
    });
  }, [open, cart?.id, templates]);

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
        params: { tenant_id: TENANT_ID, preview_type: "cart" },
      })
      .then((res) => setPreviewSvg(res.data?.svg ?? null))
      .catch(() => setPreviewSvg(null))
      .finally(() => setPreviewLoading(false));
  }, [templateId]);

  if (!open) return null;

  const handleGenerate = async () => {
    if (cart == null || templateId == null) return;
    setGenerating(true);
    try {
      const res = await api.post(
        "/labels/cart",
        { cart_id: cart.id, template_id: templateId, quantity },
        { params: { tenant_id: TENANT_ID }, responseType: "blob" }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-800 px-6 py-4 border-b border-slate-100">
          Drukuj etykietę
        </h3>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Szablon etykiety</label>
            <select
              value={templateId ?? ""}
              onChange={(e) =>
                setTemplateId(e.target.value === "" ? null : Number(e.target.value))
              }
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
            <p className="text-xs font-medium text-slate-600 mb-1">Podgląd</p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 min-h-[80px] flex items-center justify-center p-3">
              {previewLoading ? (
                <p className="text-sm text-slate-500">Ładowanie podglądu…</p>
              ) : previewSvg ? (
                <div
                  className="max-w-full max-h-40 overflow-auto [&_svg]:max-h-40 [&_svg]:w-auto [&_svg]:h-auto"
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />
              ) : (
                <p className="text-sm text-slate-500">Brak podglądu szablonu</p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ilość</label>
            <input
              type="number"
              min={1}
              max={500}
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.max(1, Math.min(500, Number(e.target.value) || 1)))
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:ring-2 focus:ring-cyan-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            Anuluj
          </button>
          <button
            type="button"
            disabled={generating || templateId == null}
            onClick={handleGenerate}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "Generowanie…" : "Generuj PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
