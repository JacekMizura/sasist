import { BookOpen, Download, Plus } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
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

export default function DocumentTemplatesModuleFrame() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isList = pathname === LIST_BASE || pathname === `${LIST_BASE}/`;

  return (
    <SettingsModuleStack
      breadcrumbs={[
        { label: "Ustawienia", to: "/settings/company" },
        { label: "Szablony dokumentów" },
      ]}
      title="Szablony dokumentów"
      description="Projektowanie wydruków ERP — wersje, publikacja, powiązania i podgląd. Niezależne od szablonów etykiet."
      tabs={DOCUMENT_TEMPLATES_TABS}
      tabsExact
      tabsAriaLabel="Szablony dokumentów"
      actions={
        isList ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`${LIST_BASE}/starters`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <BookOpen className="h-4 w-4" />
              Startery
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                exportFullPackageZip(DEFAULT_TENANT_ID)
                  .then((blob) => downloadBlob(blob, "szablony-pelny-pakiet.zip"))
                  .catch((err) => toast.error(extractApiErrorMessage(err, "Eksport nie powiódł się.")));
              }}
            >
              <Download className="h-4 w-4" />
              Eksport pakietu
            </button>
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
          <Link
            to={LIST_BASE}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Lista szablonów
          </Link>
        )
      }
    >
      <Outlet />
    </SettingsModuleStack>
  );
}
