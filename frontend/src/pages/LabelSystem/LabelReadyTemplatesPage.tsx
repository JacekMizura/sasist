import { LayoutTemplate, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import api from "../../api/axios";
import {
  formatPresetSpecLine,
  generatePreset,
  PRESET_LABELS,
  PRESET_USAGE_HINTS,
  type PresetType,
} from "../../services/labelPresets";
import type { LabelTemplate } from "../../types/labelSystem";
import { labelModuleBasePath } from "./labelModuleBasePath";
import ReadyTemplateCard from "./readyTemplates/ReadyTemplateCard";
import {
  PRESET_SECTION,
  presetsForFilter,
  READY_SECTIONS,
  sectionsVisibleForFilter,
  type ReadyFilterId,
  type ReadySectionId,
} from "./readyTemplates/readyTemplateCatalog";
import ReadyTemplatesFilterTabs from "./readyTemplates/ReadyTemplatesFilterTabs";

const TENANT_ID = 1;

const PRESET_TEMPLATE_CACHE: Partial<Record<PresetType, LabelTemplate>> = {};

function getPresetTemplate(type: PresetType): LabelTemplate {
  if (!PRESET_TEMPLATE_CACHE[type]) {
    PRESET_TEMPLATE_CACHE[type] = generatePreset(type);
  }
  return PRESET_TEMPLATE_CACHE[type]!;
}

type CustomTemplateRow = {
  id: number;
  name: string;
  template_type?: string | null;
  template_json: string;
  is_default?: boolean;
};

type LibraryCard =
  | {
      kind: "preset";
      key: string;
      section: ReadySectionId;
      presetType: PresetType;
      template: LabelTemplate;
      name: string;
      description: string;
      metaLine: string;
      isSystem: true;
      isDefault: false;
    }
  | {
      kind: "custom";
      key: string;
      section: "custom";
      id: number;
      template: LabelTemplate;
      name: string;
      description: string;
      metaLine: string;
      isSystem: false;
      isDefault: boolean;
      rawJson: string;
      templateType: string | null;
    };

function parseCustomTemplate(row: CustomTemplateRow): LibraryCard | null {
  try {
    const parsed = JSON.parse(row.template_json) as LabelTemplate;
    const widthMm = Number(parsed.widthMm) || 50;
    const heightMm = Number(parsed.heightMm) || 30;
    const dpi = Number(parsed.dpi) || 300;
    return {
      kind: "custom",
      key: `custom-${row.id}`,
      section: "custom",
      id: row.id,
      template: {
        ...parsed,
        id: String(row.id),
        name: row.name || parsed.name || "Szablon",
        widthMm,
        heightMm,
        dpi,
        elements: parsed.elements ?? [],
      },
      name: row.name || "Bez nazwy",
      description: "Twój zapisany szablon — edytuj pola i układ w projektancie.",
      metaLine: `${widthMm}×${heightMm} mm • ${dpi} DPI${
        row.template_type ? ` • ${row.template_type}` : ""
      }`,
      isSystem: false,
      isDefault: Boolean(row.is_default),
      rawJson: row.template_json,
      templateType: row.template_type ?? null,
    };
  } catch {
    return null;
  }
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const GRID_CLASS =
  "grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 min-[1400px]:grid-cols-5 min-[1600px]:grid-cols-6";

/**
 * Gotowe szablony — biblioteka startowych układów (Figma/Canva style).
 * Trasa: `/admin/print-templates/ready` (i odpowiednik w module etykiet).
 */
export function LabelReadyTemplatesPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const labelBase = labelModuleBasePath(pathname);
  const [filter, setFilter] = useState<ReadyFilterId>("all");
  const [customRows, setCustomRows] = useState<CustomTemplateRow[]>([]);
  const [customLoading, setCustomLoading] = useState(false);

  const loadCustom = useCallback(async () => {
    setCustomLoading(true);
    try {
      const res = await api.get<CustomTemplateRow[]>("/label-templates/", {
        params: { tenant_id: TENANT_ID },
      });
      setCustomRows(Array.isArray(res.data) ? res.data : []);
    } catch {
      setCustomRows([]);
    } finally {
      setCustomLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCustom();
  }, [loadCustom]);

  const cards = useMemo(() => {
    const list: LibraryCard[] = [];
    for (const type of presetsForFilter(filter)) {
      list.push({
        kind: "preset",
        key: `preset-${type}`,
        section: PRESET_SECTION[type],
        presetType: type,
        template: getPresetTemplate(type),
        name: PRESET_LABELS[type],
        description: PRESET_USAGE_HINTS[type],
        metaLine: formatPresetSpecLine(type),
        isSystem: true,
        isDefault: false,
      });
    }
    if (filter === "all" || filter === "custom") {
      for (const row of customRows) {
        const card = parseCustomTemplate(row);
        if (card) list.push(card);
      }
    }
    return list;
  }, [filter, customRows]);

  const sections = useMemo(() => {
    const visible = sectionsVisibleForFilter(filter);
    return READY_SECTIONS.filter((s) => visible.includes(s.id)).map((section) => ({
      ...section,
      cards: cards.filter((c) => c.section === section.id),
    }));
  }, [filter, cards]);

  const totalVisible = cards.length;

  const openPreset = (type: PresetType, asCopy = false) => {
    const preset = generatePreset(type);
    if (asCopy) {
      preset.name = `${preset.name} (kopia)`;
    }
    navigate(`${labelBase}/designer/new`, { state: { presetTemplate: preset } });
  };

  const openCustomEdit = (id: number) => navigate(`${labelBase}/${id}/edit`);

  const handleDuplicateCustom = async (card: Extract<LibraryCard, { kind: "custom" }>) => {
    try {
      await api.post("/label-templates/", {
        name: `${card.name} (kopia)`,
        template_json: card.rawJson,
        template_type: card.templateType,
      });
      await loadCustom();
    } catch (e) {
      console.error("Duplicate failed:", e);
    }
  };

  const handleDeleteCustom = async (id: number) => {
    if (!window.confirm("Usunąć ten szablon?")) return;
    try {
      await api.delete(`/label-templates/${id}/`);
      await loadCustom();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  return (
    <div className="min-w-0 space-y-6 bg-white px-1 pb-10 pt-2">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Gotowe szablony</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Użyj gotowego układu jako punktu startowego lub utwórz własny szablon.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`${labelBase}/new`)}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-orange-300 hover:shadow-md"
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Nowy szablon
        </button>
      </header>

      <ReadyTemplatesFilterTabs value={filter} onChange={setFilter} />

      {customLoading && filter === "custom" ? (
        <p className="text-sm text-slate-500">Ładowanie własnych szablonów…</p>
      ) : null}

      {totalVisible === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
            <LayoutTemplate className="h-8 w-8 text-orange-500" strokeWidth={1.5} aria-hidden />
          </div>
          <p className="text-lg font-semibold text-slate-900">Nie znaleziono szablonów</p>
          <p className="mt-1.5 max-w-sm text-sm text-slate-500">
            Zmień filtr albo utwórz pierwszy układ w projektancie etykiet.
          </p>
          <button
            type="button"
            onClick={() => navigate(`${labelBase}/new`)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-orange-300 hover:shadow-md"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Utwórz pierwszy szablon
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          {sections.map((section) => {
            if (section.cards.length === 0 && filter !== "all") return null;
            if (section.cards.length === 0) return null;
            return (
              <section key={section.id} className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{section.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{section.description}</p>
                  <div className="mt-3 h-px w-full bg-gray-200" aria-hidden />
                </div>
                <div className={GRID_CLASS}>
                  {section.cards.map((card) =>
                    card.kind === "preset" ? (
                      <ReadyTemplateCard
                        key={card.key}
                        name={card.name}
                        description={card.description}
                        metaLine={card.metaLine}
                        template={card.template}
                        cacheKey={`ready-preset:${card.presetType}`}
                        isSystem
                        onEdit={() => openPreset(card.presetType)}
                        onUse={() => openPreset(card.presetType)}
                        onDuplicate={() => openPreset(card.presetType, true)}
                        onExport={() =>
                          downloadJson(
                            `${card.presetType.toLowerCase()}.json`,
                            generatePreset(card.presetType),
                          )
                        }
                      />
                    ) : (
                      <ReadyTemplateCard
                        key={card.key}
                        name={card.name}
                        description={card.description}
                        metaLine={card.metaLine}
                        template={card.template}
                        cacheKey={`ready-custom:${card.id}:${card.template.updatedAt ?? ""}`}
                        isDefault={card.isDefault}
                        onEdit={() => openCustomEdit(card.id)}
                        onUse={() => openCustomEdit(card.id)}
                        onDuplicate={() => void handleDuplicateCustom(card)}
                        onExport={() => downloadJson(`template-${card.id}.json`, card.template)}
                        onDelete={() => void handleDeleteCustom(card.id)}
                      />
                    ),
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
