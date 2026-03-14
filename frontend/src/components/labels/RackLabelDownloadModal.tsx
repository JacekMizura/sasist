import { useEffect, useState } from "react";
import api from "../../api/axios";
import type { RackState, BinState } from "../../types/warehouse";
import type { LabelTemplate, TemplateElement, RepeaterElement } from "../../types/labelSystem";
import { renderLabel } from "../../labelRenderer";
import { exportLabelsPdf } from "../../utils/labels/exportLabelsPdf";

type RackLocationItem = {
  label: string;
  barcode?: string;
  level_index?: number;
  segment_index?: number;
};

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

function getRackLocations(rack: RackState | null | undefined): RackLocationItem[] {
  if (!rack) return [];
  const bins: BinState[] = rack.bins ?? [];
  return bins.map((b) => ({
    label: b.label,
    barcode: b.barcode_data ?? b.label,
    level_index: b.level_index,
    segment_index: b.segment_index,
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

/** Chunk array into groups of `size`; used to build one label per chunk for strip templates. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
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
      const datasetKey = repeater?.dataset?.trim() || "locations";
      let capacity: number;
      if (repeater?.layout === "grid" && repeater.columns != null && repeater.columns > 0) {
        capacity = Math.max(1, repeater.columns);
      } else if (repeater) {
        const itemWidth =
          Number(repeater.itemWidth) ||
          Number((repeater as { item_width?: number }).item_width) ||
          0;
        capacity =
          itemWidth > 0
            ? Math.max(1, Math.floor(template.widthMm / itemWidth))
            : 1;
      } else {
        capacity = 1;
      }

      const chunks = chunk(effectiveLocations, capacity);

      console.log("effectiveLocations", effectiveLocations);
      console.log("chunks", chunks);

      const rackName = rack.name ?? `${(rack as { rowPrefix?: string }).rowPrefix ?? "A"}${(rack as { indexInRow?: number }).indexInRow ?? rack.rack_index ?? 1}`;
      const svgs: string[] = [];
      for (const group of chunks) {
        const first = group[0] as RackLocationItem | undefined;
        const datasetItems = group.map((loc): Record<string, unknown> => {
          const item = typeof loc === "object" && loc !== null && "label" in loc
            ? (loc as RackLocationItem)
            : { label: String(loc), barcode: String(loc) };
          const levIdx = item.level_index;
          const segIdx = item.segment_index;
          const hasStructural = typeof levIdx === "number" && typeof segIdx === "number";
          const level = hasStructural ? levIdx + 1 : (Number(String(item.label).split("-")[1]) || 0);
          const position = hasStructural ? segIdx + 1 : (Number(String(item.label).split("-")[2]) || 0);
          const bin = hasStructural ? (segIdx! < 26 ? String.fromCharCode(65 + segIdx!) : String(segIdx! + 1)) : undefined;
          return {
            loc_name: item.label,
            location_name: item.label,
            location_code: item.label,
            location_barcode: item.barcode ?? item.label,
            barcode_data: item.barcode ?? item.label,
            rack_name: rackName,
            level,
            position,
            ...(bin != null ? { bin } : {}),
          };
        });
        const firstLevIdx = first?.level_index;
        const firstSegIdx = first?.segment_index;
        const firstHasStructural = typeof firstLevIdx === "number" && typeof firstSegIdx === "number";
        const firstLevel = firstHasStructural ? firstLevIdx! + 1 : (first ? Number(String(first.label).split("-")[1]) || 0 : 0);
        const firstPosition = firstHasStructural ? firstSegIdx! + 1 : (first ? Number(String(first.label).split("-")[2]) || 0 : 0);
        const record = {
          [datasetKey]: datasetItems,
          loc_name: first?.label ?? "",
          location_name: first?.label ?? "",
          location_code: first?.label ?? "",
          location_barcode: first?.barcode ?? first?.label ?? "",
          barcode_data: first?.barcode ?? first?.label ?? "",
          rack_name: rackName,
          level: firstLevel,
          position: firstPosition,
        };
        console.log("datasetItems", datasetItems);
        console.log("record", record);
        const svg = await renderLabel(template, record);
        svgs.push(svg);
      }

      await exportLabelsPdf(svgs, template.widthMm, template.heightMm, `rack-${rack.id ?? rack.rack_index}-labels.pdf`, null, template);
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

