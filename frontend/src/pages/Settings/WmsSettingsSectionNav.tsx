import { useWmsSettingsSectionRegistry } from "./WmsSettingsSectionRegistryContext";
import { Menu } from "lucide-react";
import { useState } from "react";

/**
 * Left section rail — icon + label, brand-orange active state (Pakowanie pattern).
 * On small screens collapses into a simple disclosure list.
 */
export default function WmsSettingsSectionNav() {
  const { orderedSections, activeSectionId, scrollToSection, observe } = useWmsSettingsSectionRegistry();
  const [mobileOpen, setMobileOpen] = useState(false);

  const list = (
    <nav className="space-y-0.5" aria-label="Nawigacja sekcji">
      {orderedSections.map((section) => {
        const isActive = observe && activeSectionId === section.id;
        const Icon = section.icon;
        const iconTone =
          section.iconClassName ??
          (isActive ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-500");
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => {
              scrollToSection(section.id);
              setMobileOpen(false);
            }}
            className={
              isActive
                ? "flex w-full items-center gap-2.5 rounded-lg bg-orange-50 px-2.5 py-2 text-left text-sm font-semibold text-orange-700 transition-colors"
                : "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            }
          >
            {Icon ? (
              <span
                className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconTone}`}
                aria-hidden
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
            ) : null}
            <span className="min-w-0 truncate">{section.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <div className="mb-3 md:hidden">
        <button
          type="button"
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-800 shadow-sm"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
        >
          <Menu className="h-4 w-4" aria-hidden />
          Sekcje ustawień
        </button>
        {mobileOpen ? <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">{list}</div> : null}
      </div>
      <div className="hidden md:block">{list}</div>
    </>
  );
}
