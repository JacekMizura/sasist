import { LayoutTemplate, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import api from "../../api/axios";
import { PrimaryButton } from "../../design-system";
import {
  formatPresetSpecLine,
  generatePreset,
  PRESET_LABELS,
  PRESET_USAGE_HINTS,
  type PresetType,
} from "../../services/labelPresets";
import type { LabelTemplate } from "../../types/labelSystem";
import { formatLabelSizeMm } from "../../utils/formatMm";
import { labelModuleBasePath } from "./labelModuleBasePath";
import { printModuleTypeLabel } from "./labelPrintModuleTypes";
import ReadyTemplateCard from "./readyTemplates/ReadyTemplateCard";
import { LabelGalleryThumbnail } from "./components/LabelGalleryThumbnail";
import {
  PRESET_SECTION,
  presetsForFilter,
  READY_SECTIONS,
  sectionsVisibleForFilter,
  type ReadyFilterId,
  type ReadySectionId,
} from "./readyTemplates/readyTemplateCatalog";
import {
  READY_TEMPLATES_CTA_ROW_CLASS,
  READY_TEMPLATES_EMPTY_CLASS,
  READY_TEMPLATES_EMPTY_CTA_CLASS,
  READY_TEMPLATES_EMPTY_DESC_CLASS,
  READY_TEMPLATES_EMPTY_ICON_WRAP_CLASS,
  READY_TEMPLATES_EMPTY_TITLE_CLASS,
  READY_TEMPLATES_GRID_CLASS,
  READY_TEMPLATES_PAGE_CLASS,
  READY_TEMPLATES_SECTION_CLASS,
  READY_TEMPLATES_SECTION_DESC_CLASS,
  READY_TEMPLATES_SECTION_RULE_CLASS,
  READY_TEMPLATES_SECTION_TITLE_CLASS,
  READY_TEMPLATES_SECTIONS_CLASS,
  READY_TEMPLATES_THUMB_CLASS,
} from "./readyTemplates/readyTemplatesLayout";
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
  updated_at?: string | null;
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

function formatEditedDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `Edytowano ${date.toLocaleDateString("pl-PL")}`;
}

function parseCustomTemplate(row: CustomTemplateRow): LibraryCard | null {
  try {
    const parsed = JSON.parse(row.template_json) as LabelTemplate;
    const widthMm = Number(parsed.widthMm) || 50;
    const heightMm = Number(parsed.heightMm) || 30;
    const dpi = Number(parsed.dpi) || 300;
    const typeLabel = printModuleTypeLabel(row.template_type ?? parsed.template_type);
    const size = formatLabelSizeMm(widthMm, heightMm);
    const edited = formatEditedDate(row.updated_at ?? parsed.updatedAt);
    const metaLine = edited ? `${typeLabel} • ${size} • ${edited}` : `${typeLabel} • ${size}`;
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
      metaLine,
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
    <div className={READY_TEMPLATES_PAGE_CLASS}>
      <div className={READY_TEMPLATES_CTA_ROW_CLASS}>
        <PrimaryButton type="button" density="compact" onClick={() => navigate(`${labelBase}/new`)}>
          <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Nowy szablon
        </PrimaryButton>
      </div>

      <ReadyTemplatesFilterTabs value={filter} onChange={setFilter} />

      {customLoading && filter === "custom" ? (
        <p className="text-sm text-slate-500">Ładowanie własnych szablonów…</p>
      ) : null}

      {totalVisible === 0 ? (
        <div className={READY_TEMPLATES_EMPTY_CLASS}>
          <div className={READY_TEMPLATES_EMPTY_ICON_WRAP_CLASS}>
            <LayoutTemplate className="h-8 w-8 text-orange-500" strokeWidth={1.5} aria-hidden />
          </div>
          <p className={READY_TEMPLATES_EMPTY_TITLE_CLASS}>Nie znaleziono szablonów</p>
          <p className={READY_TEMPLATES_EMPTY_DESC_CLASS}>
            Zmień filtr albo utwórz pierwszy układ w projektancie etykiet.
          </p>
          <button
            type="button"
            onClick={() => navigate(`${labelBase}/new`)}
            className={READY_TEMPLATES_EMPTY_CTA_CLASS}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Utwórz pierwszy szablon
          </button>
        </div>
      ) : (
        <div className={READY_TEMPLATES_SECTIONS_CLASS}>
          {sections.map((section) => {
            if (section.cards.length === 0 && filter !== "all") return null;
            if (section.cards.length === 0) return null;
            return (
              <section key={section.id} className={READY_TEMPLATES_SECTION_CLASS}>
                <div>
                  <h3 className={READY_TEMPLATES_SECTION_TITLE_CLASS}>{section.title}</h3>
                  <p className={READY_TEMPLATES_SECTION_DESC_CLASS}>{section.description}</p>
                  <div className={READY_TEMPLATES_SECTION_RULE_CLASS} aria-hidden />
                </div>
                <div className={READY_TEMPLATES_GRID_CLASS}>
                  {section.cards.map((card) =>
                    card.kind === "preset" ? (
                      <ReadyTemplateCard
                        key={card.key}
                        name={card.name}
                        description={card.description}
                        metaLine={card.metaLine}
                        thumbnail={
                          <LabelGalleryThumbnail
                            template={card.template}
                            cacheKey={`ready-preset:${card.presetType}`}
                            className={READY_TEMPLATES_THUMB_CLASS}
                          />
                        }
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
                        thumbnail={
                          <LabelGalleryThumbnail
                            template={card.template}
                            cacheKey={`ready-custom:${card.id}:${card.template.updatedAt ?? ""}`}
                            className={READY_TEMPLATES_THUMB_CLASS}
                          />
                        }
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
