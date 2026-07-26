import {
  brandSidebarNavActiveBarClassName,
  brandSidebarNavItemClassName,
} from "../../../design-system/brandUi";
import type { DocumentTemplateFamilyDto } from "../../../api/documentTemplatesApi";
import {
  TEMPLATES_LIST_SIDEBAR_CLASS,
  TEMPLATES_LIST_SIDEBAR_GROUPS_SCROLL_CLASS,
  TEMPLATES_LIST_SIDEBAR_LIST_CLASS,
  TEMPLATES_LIST_SIDEBAR_SECTION_TITLE_CLASS,
} from "../../LabelSystem/templatesList/templatesListLayout";

export const DOC_LIST_ALL = "__all__";

type Props = {
  families: DocumentTemplateFamilyDto[];
  selectedFamilyCode: string;
  onSelectFamily: (code: string) => void;
  selectedKindCode: string;
  onSelectKind: (code: string) => void;
  kinds: DocumentTemplateFamilyDto["kinds"];
};

/**
 * Left rail for Szablony wydruków — same chrome as Label TemplatesListSidebar.
 */
export default function DocumentTemplatesListSidebar({
  families,
  selectedFamilyCode,
  onSelectFamily,
  selectedKindCode,
  onSelectKind,
  kinds,
}: Props) {
  const familyActive = selectedFamilyCode === DOC_LIST_ALL ? DOC_LIST_ALL : selectedFamilyCode;

  return (
    <aside className={TEMPLATES_LIST_SIDEBAR_CLASS}>
      <section>
        <h2 className={TEMPLATES_LIST_SIDEBAR_SECTION_TITLE_CLASS}>Rodzina</h2>
        <div className={TEMPLATES_LIST_SIDEBAR_LIST_CLASS}>
          <button
            type="button"
            onClick={() => onSelectFamily(DOC_LIST_ALL)}
            className={brandSidebarNavItemClassName(familyActive === DOC_LIST_ALL, { compact: true })}
          >
            {familyActive === DOC_LIST_ALL ? (
              <span className={brandSidebarNavActiveBarClassName} aria-hidden />
            ) : null}
            Wszystkie
          </button>
          {families.map((f) => {
            const active = selectedFamilyCode === f.code;
            return (
              <button
                key={f.code}
                type="button"
                onClick={() => onSelectFamily(f.code)}
                className={brandSidebarNavItemClassName(active, { compact: true })}
              >
                {active ? <span className={brandSidebarNavActiveBarClassName} aria-hidden /> : null}
                <span className="min-w-0 truncate">
                  {f.icon ? `${f.icon} ` : ""}
                  {f.name_pl}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <h2 className={TEMPLATES_LIST_SIDEBAR_SECTION_TITLE_CLASS}>Typ dokumentu</h2>
        <div className={TEMPLATES_LIST_SIDEBAR_GROUPS_SCROLL_CLASS}>
          <button
            type="button"
            onClick={() => onSelectKind(DOC_LIST_ALL)}
            className={brandSidebarNavItemClassName(selectedKindCode === DOC_LIST_ALL, { compact: true })}
          >
            {selectedKindCode === DOC_LIST_ALL ? (
              <span className={brandSidebarNavActiveBarClassName} aria-hidden />
            ) : null}
            Wszystkie
          </button>
          {kinds.map((k) => {
            const active = selectedKindCode === k.code;
            return (
              <button
                key={k.code}
                type="button"
                onClick={() => onSelectKind(k.code)}
                className={brandSidebarNavItemClassName(active, { compact: true })}
              >
                {active ? <span className={brandSidebarNavActiveBarClassName} aria-hidden /> : null}
                <span className="min-w-0 truncate">{k.name_pl}</span>
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
