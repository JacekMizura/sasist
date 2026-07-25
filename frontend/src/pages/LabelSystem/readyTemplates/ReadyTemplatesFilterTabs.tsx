import { tabsNavItemClassName } from "../../../components/layout/TabsNav";
import { READY_FILTERS, type ReadyFilterId } from "./readyTemplateCatalog";

type Props = {
  value: ReadyFilterId;
  onChange: (id: ReadyFilterId) => void;
};

/** Brand underline filter tabs — Design System TabsNav item classes. */
export default function ReadyTemplatesFilterTabs({ value, onChange }: Props) {
  return (
    <div className="relative min-w-0 border-b border-slate-200" role="tablist" aria-label="Filtr szablonów">
      <div className="-mx-1 flex flex-wrap gap-x-6 gap-y-0 overflow-x-auto px-1 [scrollbar-width:thin]">
        {READY_FILTERS.map((tab) => {
          const active = value === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className={tabsNavItemClassName(active)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
