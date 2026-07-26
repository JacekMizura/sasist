import {
  DOCUMENT_PRINT_MODULE_TYPE_LABELS,
  DOCUMENT_PRINT_MODULE_TYPE_ORDER,
  LABEL_PRINT_MODULE_TYPE_LABELS,
  LABEL_PRINT_MODULE_TYPE_ORDER,
} from "../labelPrintModuleTypes";
import { getTypeIcon, UNGROUPED_ID, type GroupRow } from "./templatesListTypes";
import {
  brandPrimaryButtonClass,
  brandSidebarNavActiveBarClassName,
  brandSidebarNavIconClassName,
  brandSidebarNavItemClassName,
} from "../../../design-system/brandUi";
import {
  TEMPLATES_LIST_SIDEBAR_CLASS,
  TEMPLATES_LIST_SIDEBAR_DIVIDER_CLASS,
  TEMPLATES_LIST_SIDEBAR_FOOTER_CLASS,
  TEMPLATES_LIST_SIDEBAR_GROUPS_SCROLL_CLASS,
  TEMPLATES_LIST_SIDEBAR_LIST_CLASS,
  TEMPLATES_LIST_SIDEBAR_SECTION_TITLE_CLASS,
} from "./templatesListLayout";
type Props = {
  selectedType: string;
  onSelectType: (type: string) => void;
  selectedGroupId: string | number | null;
  onSelectGroup: (id: string | number | null) => void;
  groups: GroupRow[];
  newGroupName: string;
  onNewGroupNameChange: (v: string) => void;
  onCreateGroup: () => void;
  creatingGroup: boolean;
};

/**
 * Inner left rail for Szablony — label types + groups (250–280px).
 * Does not touch the app sidebar.
 */
export default function TemplatesListSidebar({
  selectedType,
  onSelectType,
  selectedGroupId,
  onSelectGroup,
  groups,
  newGroupName,
  onNewGroupNameChange,
  onCreateGroup,
  creatingGroup,
}: Props) {
  const typeBtn = (type: string, label: string) => {
    const active = selectedType === type;
    return (
      <button
        key={type}
        type="button"
        onClick={() => onSelectType(type)}
        className={brandSidebarNavItemClassName(active, { compact: true })}
      >
        {active ? <span className={brandSidebarNavActiveBarClassName} aria-hidden /> : null}
        <span className={brandSidebarNavIconClassName(active)}>{getTypeIcon(type)}</span>
        {label}
      </button>
    );
  };

  return (
    <aside className={TEMPLATES_LIST_SIDEBAR_CLASS}>
      <section>
        <h2 className={TEMPLATES_LIST_SIDEBAR_SECTION_TITLE_CLASS}>Typ etykiety</h2>
        <div className={TEMPLATES_LIST_SIDEBAR_LIST_CLASS}>
          {LABEL_PRINT_MODULE_TYPE_ORDER.map((type) =>
            typeBtn(type, LABEL_PRINT_MODULE_TYPE_LABELS[type] || type),
          )}
          <div className={TEMPLATES_LIST_SIDEBAR_DIVIDER_CLASS} />
          {DOCUMENT_PRINT_MODULE_TYPE_ORDER.map((type) =>
            typeBtn(type, DOCUMENT_PRINT_MODULE_TYPE_LABELS[type] || type),
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <h2 className={TEMPLATES_LIST_SIDEBAR_SECTION_TITLE_CLASS}>Grupy</h2>
        <div className={TEMPLATES_LIST_SIDEBAR_GROUPS_SCROLL_CLASS}>          <button
            type="button"
            onClick={() => onSelectGroup(UNGROUPED_ID)}
            className={brandSidebarNavItemClassName(selectedGroupId === UNGROUPED_ID, { compact: true })}
          >
            {selectedGroupId === UNGROUPED_ID ? (
              <span className={brandSidebarNavActiveBarClassName} aria-hidden />
            ) : null}
            Bez grupy
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelectGroup(g.id)}
              className={brandSidebarNavItemClassName(selectedGroupId === g.id, { compact: true })}
            >
              {selectedGroupId === g.id ? (
                <span className={brandSidebarNavActiveBarClassName} aria-hidden />
              ) : null}
              <span className="min-w-0 truncate">{g.name}</span>
            </button>
          ))}
        </div>
        <div className={TEMPLATES_LIST_SIDEBAR_FOOTER_CLASS}>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => onNewGroupNameChange(e.target.value)}
              placeholder="Nazwa grupy"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300/40"
              onKeyDown={(e) => e.key === "Enter" && onCreateGroup()}
            />
            <button
              type="button"
              onClick={onCreateGroup}
              disabled={!newGroupName.trim() || creatingGroup}
              className={brandPrimaryButtonClass}
              aria-label="Dodaj grupę"
            >
              +
            </button>
          </div>
          <p className="mt-1.5 px-0.5 text-[11px] text-slate-400">Dodaj nową grupę</p>
        </div>
      </section>
    </aside>
  );
}
