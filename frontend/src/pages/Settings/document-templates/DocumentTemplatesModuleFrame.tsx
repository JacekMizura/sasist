import { useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";

import { SettingsModuleStack } from "../../../components/layout/SettingsModuleStack";
import { LIST_BASE } from "./constants";
import { DOCUMENT_TEMPLATES_TABS } from "./documentTemplatesTabs";

/**
 * Module chrome for Szablony wydruków — same SettingsModuleStack pattern as Label System
 * (title + tabs only; CTAs live in-page like Label Ready / Label list toolbar).
 */
export default function DocumentTemplatesModuleFrame() {
  const { templateId } = useParams<{ templateId?: string }>();
  const isEditor = Boolean(templateId && /^\d+$/.test(templateId));
  const [editorTitle, setEditorTitle] = useState("Edycja szablonu");

  useEffect(() => {
    if (!isEditor || !templateId) return;
    const onName = (e: Event) => {
      const detail = (e as CustomEvent<{ id: number; name: string }>).detail;
      if (String(detail.id) === templateId) setEditorTitle(detail.name);
    };
    window.addEventListener("dte-template-name-changed", onName);
    return () => window.removeEventListener("dte-template-name-changed", onName);
  }, [isEditor, templateId]);

  if (isEditor) {
    return (
      <SettingsModuleStack
        breadcrumbs={[
          { label: "Szablony wydruków", to: LIST_BASE },
          { label: editorTitle },
        ]}
        title=""
        tabs={[]}
        tabsAriaLabel="Szablony wydruków"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </SettingsModuleStack>
    );
  }

  return (
    <SettingsModuleStack
      title="Szablony wydruków"
      tabs={DOCUMENT_TEMPLATES_TABS}
      tabsExact
      tabsAriaLabel="Szablony wydruków"
    >
      <Outlet />
    </SettingsModuleStack>
  );
}
