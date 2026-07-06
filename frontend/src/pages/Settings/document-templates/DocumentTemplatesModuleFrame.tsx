import { useEffect, useState } from "react";
import { Download, Plus } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { exportFullPackageZip } from "../../../api/documentTemplatesApi";
import { extractApiErrorMessage } from "../../../api/apiErrorMessage";
import { SettingsModuleStack } from "../../../components/layout/SettingsModuleStack";
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

function ListHeaderMoreMenu() {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        Więcej ▾
      </summary>
      <div className="absolute right-0 z-20 mt-1 min-w-[220px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          onClick={() => {
            exportFullPackageZip(DEFAULT_TENANT_ID)
              .then((blob) => downloadBlob(blob, "szablony-pelny-pakiet.zip"))
              .catch((err) => toast.error(extractApiErrorMessage(err, "Eksport nie powiódł się.")));
          }}
        >
          <Download className="h-4 w-4 shrink-0" aria-hidden />
          Eksport pakietu
        </button>
      </div>
    </details>
  );
}

export default function DocumentTemplatesModuleFrame() {
  const { pathname } = useLocation();
  const { templateId } = useParams<{ templateId?: string }>();
  const navigate = useNavigate();
  const isList = pathname === LIST_BASE || pathname === `${LIST_BASE}/`;
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

  return (
    <SettingsModuleStack
      breadcrumbs={[
        { label: "Ustawienia", to: "/settings/company" },
        { label: "Szablony wydruków" },
      ]}
      title="Szablony wydruków"
      description="Projektowanie wydruków ERP."
      tabs={DOCUMENT_TEMPLATES_TABS}
      tabsExact
      tabsAriaLabel="Szablony wydruków"
      actions={
        isList ? (
          <div className="flex flex-wrap items-center gap-2">
            <ListHeaderMoreMenu />
            <button
              type="button"
              onClick={() => navigate(`${LIST_BASE}/new`)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Nowy szablon
            </button>
          </div>
        ) : (
          <Link to={LIST_BASE} className="text-sm font-medium text-slate-600 hover:text-slate-900">
            ← Lista szablonów
          </Link>
        )
      }
    >
      <Outlet />
    </SettingsModuleStack>
  );
}
