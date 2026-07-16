import { READY_FILTERS, type ReadyFilterId } from "./readyTemplateCatalog";

type Props = {
  value: ReadyFilterId;
  onChange: (id: ReadyFilterId) => void;
};

/** Orange underline filter tabs — wrap or horizontal scroll, never clipped. */
export default function ReadyTemplatesFilterTabs({ value, onChange }: Props) {
  return (
    <div className="relative min-w-0 border-b border-gray-200" role="tablist" aria-label="Filtr szablonów">
      <div className="-mx-1 flex flex-wrap gap-x-1 gap-y-0 overflow-x-auto px-1 [scrollbar-width:thin]">
        {READY_FILTERS.map((tab) => {
          const active = value === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className={[
                "relative shrink-0 whitespace-nowrap px-3 py-2.5 text-sm transition-colors duration-200",
                active
                  ? "font-semibold text-slate-900"
                  : "font-medium text-slate-500 hover:text-slate-800",
              ].join(" ")}
            >
              {tab.label}
              <span
                className={[
                  "absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-orange-500 transition-all duration-200 ease-out",
                  active ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0",
                ].join(" ")}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
