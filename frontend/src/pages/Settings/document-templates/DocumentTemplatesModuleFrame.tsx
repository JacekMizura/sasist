import { useEffect, useState } from "react";
import { Download, Plus } from "lucide-react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { exportFullPackageZip } from "../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import TopTabsNavigation from "../../../components/TopTabsNavigation";
import { SettingsModuleStack } from "../../../components/layout/SettingsModuleStack";
import { pageModuleContentOffsetClass, pageModuleTabsOffsetClass } from "../../../design-system/pageLayout";
import { PrimaryButton, SuccessButton } from "../../../design-system";
import { isTemplatesHubPath } from "../../Templates/templatesPaths";
import { DEFAULT_TENANT_ID, LIST_BASE } from "./constants";
import { DOCUMENT_TEMPLATES_TABS } from "./documentTemplatesTabs";

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DocumentTemplatesModuleFrame() {
  const { pathname } = useLocation();
  const { templateId } = useParams<{ templateId?: string }>();
  const navigate = useNavigate();
  const inHub = isTemplatesHubPath(pathname);
  const isList = pathname === LIST_BASE || pathname === `${LIST_BASE}/`;
  const showPrimaryNew = isList || pathname === `${LIST_BASE}/starters`;
  const isEditor = Boolean(templateId && /^\d+$/.test(templateId));
  const [editorTitle, setEditorTitle] = useState("Edycja szablonu");
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    if (!isEditor || !templateId) return;
    const onName = (e: Event) => {
      const detail = (e as CustomEvent<{ id: number; name: string }>).detail;
      if (String(detail.id) === templateId) setEditorTitle(detail.name);
    };
    window.addEventListener("dte-template-name-changed", onName);
    return () => window.removeEventListener("dte-template-name-changed", onName);
  }, [isEditor, templateId]);

  const onExportPackage = () => {
    setExportBusy(true);
    exportFullPackageZip(DEFAULT_TENANT_ID)
      .then((blob) => downloadBlob(blob, "szablony-pelny-pakiet.zip"))
      .catch((err) => toast.error(extractApiErrorMessage(err, "Eksport nie powiódł się.")))
      .finally(() => setExportBusy(false));
  };

  const actions = showPrimaryNew ? (
    <div className="flex flex-wrap items-center gap-2">
      {isList ? (
        <SuccessButton type="button" density="compact" disabled={exportBusy} onClick={onExportPackage}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          {exportBusy ? "Eksport…" : "Eksportuj"}
        </SuccessButton>
      ) : null}
      <PrimaryButton type="button" density="compact" onClick={() => navigate(`${LIST_BASE}/new`)}>
        <Plus className="h-4 w-4" aria-hidden />
        Nowy szablon
      </PrimaryButton>
    </div>
  ) : null;

  if (isEditor) {
    if (inHub) {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      );
    }
    return (
      <SettingsModuleStack
        breadcrumbs={[
          { label: "Ustawienia", to: "/settings/company" },
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

  if (inHub) {
    return (
      <div className="min-w-0">
        <div className={`flex flex-wrap items-end justify-between gap-3 ${pageModuleTabsOffsetClass}`}>
          <div className="min-w-0 flex-1">
            <TopTabsNavigation tabs={DOCUMENT_TEMPLATES_TABS} exact aria-label="Szablony wydruków" />
          </div>
          {actions ? <div className="mb-0.5 shrink-0 pb-0.5">{actions}</div> : null}
        </div>
        <div className={pageModuleContentOffsetClass}>
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <SettingsModuleStack
      breadcrumbs={[
        { label: "Ustawienia", to: "/settings/company" },
        { label: "Szablony wydruków" },
      ]}
      title="Szablony wydruków"
      tabs={DOCUMENT_TEMPLATES_TABS}
      tabsExact
      tabsAriaLabel="Szablony wydruków"
      actions={actions}
    >
      <Outlet />
    </SettingsModuleStack>
  );
}
