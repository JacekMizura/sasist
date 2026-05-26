import { useWmsSettingsSectionRegistry } from "./WmsSettingsSectionRegistryContext";

export default function WmsSettingsSectionNav() {
  const { orderedSections, activeSectionId, scrollToSection, observe } = useWmsSettingsSectionRegistry();

  return (
    <nav className="space-y-1" aria-label="Nawigacja sekcji">
      {orderedSections.map((section) => {
        const isActive = observe && activeSectionId === section.id;
        const navItemClass = isActive
          ? "block w-full rounded px-3 py-2 text-left text-sm transition-colors bg-blue-100 text-blue-600"
          : "block w-full rounded px-3 py-2 text-left text-sm text-slate-800 transition-colors hover:bg-slate-100";

        return (
          <button
            key={section.id}
            type="button"
            onClick={() => scrollToSection(section.id)}
            className={navItemClass}
          >
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}
