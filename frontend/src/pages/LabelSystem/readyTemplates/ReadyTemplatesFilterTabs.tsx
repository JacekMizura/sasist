import { tabsNavItemClassName } from "../../../components/layout/TabsNav";
import {
  READY_TEMPLATES_FILTER_TABS_INNER_CLASS,
  READY_TEMPLATES_FILTER_TABS_ROOT_CLASS,
} from "./readyTemplatesLayout";
import { READY_FILTERS, type ReadyFilterId } from "./readyTemplateCatalog";

export type ReadyFilterTab = { id: string; label: string };

type Props = {
  value: string;
  onChange: (id: string) => void;
  tabs?: ReadyFilterTab[];
  ariaLabel?: string;
};

/** Brand underline filter tabs — Design System TabsNav item classes (Label System SSOT). */
export default function ReadyTemplatesFilterTabs({
  value,
  onChange,
  tabs = READY_FILTERS,
  ariaLabel = "Filtr szablonów",
}: Props) {
  return (
    <div className={READY_TEMPLATES_FILTER_TABS_ROOT_CLASS} role="tablist" aria-label={ariaLabel}>
      <div className={READY_TEMPLATES_FILTER_TABS_INNER_CLASS}>
        {tabs.map((tab) => {
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

/** Typed helper for Label Ready page (preserves ReadyFilterId). */
export function LabelReadyTemplatesFilterTabs({
  value,
  onChange,
}: {
  value: ReadyFilterId;
  onChange: (id: ReadyFilterId) => void;
}) {
  return (
    <ReadyTemplatesFilterTabs
      value={value}
      onChange={(id) => onChange(id as ReadyFilterId)}
      tabs={READY_FILTERS}
    />
  );
}
