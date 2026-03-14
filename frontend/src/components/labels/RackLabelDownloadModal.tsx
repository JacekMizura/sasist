import { useEffect, useState } from "react";
import api from "../../api/axios";
import type { RackState, BinState } from "../../types/warehouse";
import type { LabelTemplate, TemplateElement, RepeaterElement } from "../../types/labelSystem";
import { renderLabel } from "../../labelRenderer";
import { exportLabelsPdf } from "../../utils/labels/exportLabelsPdf";

type Props = {
  rack: RackState | null | undefined;
  locations: Array<{ label: string; barcode?: string }>;
  onClose: () => void;
};

type TemplateRow = {
  id: number;
  name: string;
  template_json: string;
  template_type?: string | null;
};

const TENANT_ID = 1;

function getRackLocations(rack: RackState | null | undefined): Array<{ label: string; barcode?: string }> {
  if (!rack) return [];
  const bins: BinState[] = rack.bins ?? [];
  return bins.map((b) => ({
    label: b.label,
    barcode: b.barcode_data ?? b.label,
  }));
}

function findHorizontalRepeater(template: LabelTemplate): RepeaterElement | null {
  for (const el of template.elements as TemplateElement[]) {
    if (el.type === "repeater") {
      const rep = el as RepeaterElement;
      if (rep.direction === "horizontal") return rep;
    }
  }
  return null;
}

export function RackLabelDownloadModal({ rack, locations, onClose }: Props) {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const effectiveLocations = locations.length ? locations : getRackLocations(rack);

  useEffect(() => {
    if (!rack) return;
    setLoading(true);
    api
      .get<TemplateRow[]>("/label-templates/", {
        params: { tenant_id: TENANT_ID, template_type: "location" },
      })
      .then((res) => setTemplates(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [rack?.id]);

  useEffect(() => {
    if (!templates.length) return;
    setSelectedTemplateId((prev) => {
      if (prev == null || !templates.some((t) => t.id === prev)) return templates[0].id;
      return prev;
    });
  }, [templates]);

  if (!rack) return null;

  const handleDownload = async () => {
    if (!rack || !selectedTemplateId || !effectiveLocations.length) return;
    setGenerating(true);
    try {
      const row = templates.find((t) => t.id === selectedTemplateId);
      if (!row) {
        alert("Nie znaleziono wybranego szablonu.");
        return;
      }

      let template: LabelTemplate;
      try {
        template = JSON.parse(row.template_json) as LabelTemplate;
      } catch {
        alert("Wybrany szablon ma nieprawidłowy format.");
        return;
      }

      const repeater = findHorizontalRepeater(template);
      const itemWidth = repeater?.itemWidth && repeater.itemWidth > 0 ? repeater.itemWidth : template.widthMm;
      const capacity = Math.max(1, Math.floor(template.widthMm / itemWidth));

      const chunks: typeof effectiveLocations[] = [];
      for (let i = 0; i < effectiveLocations.length; i += capacity) {
        chunks.push(effectiveLocations.slice(i, i + capacity));
      }

      const svgs: string[] = [];
      for (const chunk of chunks) {
        const first = chunk[0];
        const record = {
          locations: chunk.map((loc) => ({
            location_code: loc.label,
            location_barcode: loc.barcode ?? loc.label,
          })),
          location_code: first?.label ?? "",
          location_barcode: first?.barcode ?? first?.label ?? "",
          barcode_data: first?.barcode ?? first?.label ?? "",
        };
        const svg = await renderLabel(template, record);
        svgs.push(svg);
      }

      await exportLabelsPdf(svgs, template.widthMm, template.heightMm, `rack-${rack.id ?? rack.rack_index}-labels.pdf`);
      onClose();
    } catch (err) {
      console.error(err);
      alert("Nie udało się wygenerować etykiet.");
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
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">
            Pobierz etykiety dla regału {rack ? rack.name ?? `${rack.aisle_letter}${rack.rack_index}` : ""}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Zamknij"
          >
            ×
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Szablon etykiety</label>
            {loading ? (
              <p className="text-sm text-slate-500">Ładowanie szablonów…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-slate-500">Brak dostępnych szablonów etykiet lokalizacji.</p>
            ) : (
              <select
                value={selectedTemplateId ?? ""}
                onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-cyan-500"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <p className="block text-sm font-medium text-slate-700 mb-1">Zakres</p>
            <p className="text-sm text-slate-600">
              Wszystkie lokalizacje w regale ({effectiveLocations.length} pozycji)
            </p>
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
            disabled={generating || !selectedTemplateId || !effectiveLocations.length}
            onClick={handleDownload}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "Generowanie…" : "Pobierz PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

