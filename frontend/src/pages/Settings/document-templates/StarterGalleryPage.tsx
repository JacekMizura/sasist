import { useEffect, useMemo, useState } from "react";
import { LayoutTemplate, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import {
  createDocumentTemplateFromStarter,
  fetchStarterGallery,
  type StarterGalleryItem,
} from "@/api/documentTemplatesApi";
import { extractApiErrorMessage } from "@/api/apiErrorMessage";
import { useStarterTemplateFlow } from "@/components/templates/starterFlow";
import { PrimaryButton } from "@/design-system";
import ReadyTemplateCard from "@/pages/LabelSystem/readyTemplates/ReadyTemplateCard";
import ReadyTemplatesFilterTabs from "@/pages/LabelSystem/readyTemplates/ReadyTemplatesFilterTabs";
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
  READY_TEMPLATES_THUMB_MEDIA_CLASS,
} from "@/pages/LabelSystem/readyTemplates/readyTemplatesLayout";
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";
import { StarterThumbnailImage } from "./components/StarterThumbnailImage";

const CATEGORY_SECTIONS: { id: string; title: string; description: string }[] = [
  { id: "featured", title: "Polecane", description: "Najczęściej wybierane układy startowe." },
  { id: "recent", title: "Nowe", description: "Ostatnio dodane startery dokumentów." },
  { id: "popular", title: "Najpopularniejsze", description: "Układy używane najczęściej w tenancie." },
];

const FILTER_TABS = [
  { id: "all", label: "Wszystkie" },
  { id: "featured", label: "Polecane" },
  { id: "recent", label: "Nowe" },
  { id: "popular", label: "Najpopularniejsze" },
];

export function StarterGalleryPage() {
  const navigate = useNavigate();
  const starterFlow = useStarterTemplateFlow();
  const [gallery, setGallery] = useState<{
    items: StarterGalleryItem[];
    total: number;
    families: string[];
    kinds: string[];
    tags: string[];
  } | null>(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStarterGallery(DEFAULT_TENANT_ID)
      .then(setGallery)
      .catch((err) => toast.error(extractApiErrorMessage(err, "Nie udało się wczytać starterów.")))
      .finally(() => setLoading(false));
  }, []);

  const sections = useMemo(() => {
    const items = gallery?.items ?? [];
    const visibleSections =
      filter === "all" ? CATEGORY_SECTIONS : CATEGORY_SECTIONS.filter((s) => s.id === filter);

    return visibleSections
      .map((section) => ({
        ...section,
        items: items.filter((i) => (i.categories || []).includes(section.id)),
      }))
      .filter((s) => s.items.length > 0);
  }, [gallery, filter]);

  const totalVisible = sections.reduce((n, s) => n + s.items.length, 0);

  function requestUseDocumentStarter(item: StarterGalleryItem) {
    starterFlow.requestUseStarter({
      starterName: item.name_pl,
      createCopy: async (name) => {
        const created = await createDocumentTemplateFromStarter(DEFAULT_TENANT_ID, {
          kind_code: item.kind_code,
          name,
          starter_code: item.code,
        });
        return { editorPath: `${LIST_BASE}/${created.id}` };
      },
    });
  }

  return (
    <div className={READY_TEMPLATES_PAGE_CLASS}>
      <div className={READY_TEMPLATES_CTA_ROW_CLASS}>
        <PrimaryButton type="button" density="compact" onClick={() => navigate(`${LIST_BASE}/new`)}>
          <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          Nowy szablon
        </PrimaryButton>
      </div>

      <ReadyTemplatesFilterTabs
        value={filter}
        onChange={setFilter}
        tabs={FILTER_TABS}
        ariaLabel="Filtr gotowych szablonów"
      />

      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

      {!loading && totalVisible === 0 ? (
        <div className={READY_TEMPLATES_EMPTY_CLASS}>
          <div className={READY_TEMPLATES_EMPTY_ICON_WRAP_CLASS}>
            <LayoutTemplate className="h-8 w-8 text-orange-500" strokeWidth={1.5} aria-hidden />
          </div>
          <p className={READY_TEMPLATES_EMPTY_TITLE_CLASS}>Nie znaleziono szablonów</p>
          <p className={READY_TEMPLATES_EMPTY_DESC_CLASS}>
            Zmień filtr albo utwórz pierwszy szablon dokumentu.
          </p>
          <button
            type="button"
            onClick={() => navigate(`${LIST_BASE}/new`)}
            className={READY_TEMPLATES_EMPTY_CTA_CLASS}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Utwórz pierwszy szablon
          </button>
        </div>
      ) : null}

      {!loading && totalVisible > 0 ? (
        <div className={READY_TEMPLATES_SECTIONS_CLASS}>
          {sections.map((section) => (
            <section key={section.id} className={READY_TEMPLATES_SECTION_CLASS}>
              <div>
                <h3 className={READY_TEMPLATES_SECTION_TITLE_CLASS}>{section.title}</h3>
                <p className={READY_TEMPLATES_SECTION_DESC_CLASS}>{section.description}</p>
                <div className={READY_TEMPLATES_SECTION_RULE_CLASS} aria-hidden />
              </div>
              <div className={READY_TEMPLATES_GRID_CLASS}>
                {section.items.map((item) => {
                  const tags = (item.tags ?? []).slice(0, 2).filter(Boolean).join(" · ");
                  const metaLine = [item.kind_name, tags].filter(Boolean).join(" • ");
                  return (
                    <ReadyTemplateCard
                      key={item.id}
                      mode="starter"
                      name={item.name_pl}
                      description={item.description || item.family_name || "Gotowy układ dokumentu"}
                      metaLine={metaLine}
                      thumbnail={
                        <StarterThumbnailImage
                          starterId={item.id}
                          alt={item.name_pl}
                          className={READY_TEMPLATES_THUMB_MEDIA_CLASS}
                        />
                      }
                      isSystem={Boolean(item.is_system)}
                      onUseStarter={() => requestUseDocumentStarter(item)}
                      onExport={() => navigate(`${LIST_BASE}/starters/${item.id}`)}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}
      {starterFlow.dialog}
    </div>
  );
}
