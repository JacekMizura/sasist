import { Outlet, useLocation } from "react-router-dom";

import PageLayout from "../../components/layout/PageLayout";
import { SettingsModuleStack } from "../../components/layout/SettingsModuleStack";
import { TEMPLATES_HUB_TABS } from "./templatesHubTabs";
import { isTemplatesHubChromeHidden } from "./templatesPaths";

/**
 * Hub shell for all template modules (labels / print / messages / exports).
 * Nested modules keep their own subsection tabs and logic unchanged.
 */
export default function TemplatesHubLayout() {
  const { pathname } = useLocation();

  if (isTemplatesHubChromeHidden(pathname)) {
    return <Outlet />;
  }

  return (
    <PageLayout fullBleed cardClassName="min-h-[60vh] min-w-0">
      <SettingsModuleStack
        breadcrumbs={[{ label: "Szablony" }]}
        title="Szablony"
        tabs={TEMPLATES_HUB_TABS}
        tabsAriaLabel="Sekcje szablonów"
      >
        <Outlet />
      </SettingsModuleStack>
    </PageLayout>
  );
}
