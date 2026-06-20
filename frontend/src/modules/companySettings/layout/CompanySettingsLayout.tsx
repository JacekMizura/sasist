import { Loader2 } from "lucide-react";
import { memo, useEffect } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import PageLayout from "../../../components/layout/PageLayout";
import { TabsNav } from "../../../components/layout/TabsNav";
import { flatSectionDividerClass } from "../../../components/layout/flatSectionTokens";
import { ModuleListBreadcrumb } from "../../../components/listPage/moduleList";
import { isSuperRole } from "../../../auth/isSuperRole";
import { useAuth } from "../../../context/AuthContext";
import { PurchasingContentArea } from "../../purchasing/ui";
import { COMPANY_SETTINGS_TABS, resolveCompanySettingsTabMeta } from "../companySettingsTabs";
import { CompanySettingsProvider } from "../context/CompanySettingsContext";

const LEGACY_TAB_ROUTES: Record<string, string> = {
  magazyny: "/settings/company/warehouses",
  tenanty: "/settings/company/tenants",
  branding: "/settings/company/branding",
};

function CompanySettingsLayoutInner() {
  const { user, loading: authLoading, hasPermission, sessionReady } = useAuth();
  const canEdit =
    hasPermission("settings.users") || hasPermission("settings.company") || isSuperRole(user?.role ?? "");
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const meta = resolveCompanySettingsTabMeta(location.pathname);

  useEffect(() => {
    const legacy = searchParams.get("zakladka");
    if (legacy && LEGACY_TAB_ROUTES[legacy]) {
      navigate(LEGACY_TAB_ROUTES[legacy], { replace: true });
    }
  }, [navigate, searchParams]);

  if (authLoading || !sessionReady) {
    return (
      <PageLayout fullBleed>
        <div className="flex items-center justify-center py-24 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        </div>
      </PageLayout>
    );
  }

  if (!canEdit) {
    return <Navigate to="/" replace />;
  }

  return (
    <PageLayout fullBleed>
      <ModuleListBreadcrumb
        items={[
          { label: "Ustawienia", to: "/settings/wms" },
          { label: "Firma", to: "/settings/company" },
          ...(location.pathname !== "/settings/company" ? [{ label: meta.title }] : []),
        ]}
      />
      <h1 className="text-2xl font-semibold text-slate-900">{meta.title}</h1>
      <p className="mt-1 max-w-4xl text-sm text-slate-500">{meta.description}</p>
      <TabsNav
        items={COMPANY_SETTINGS_TABS}
        exact
        aria-label="Firma — zakładki"
        className="mt-6 gap-8"
      />
      <div className={`${flatSectionDividerClass} mt-3`} aria-hidden />
      <div className="pt-6">
        <PurchasingContentArea>
          <Outlet />
        </PurchasingContentArea>
      </div>
    </PageLayout>
  );
}

function CompanySettingsLayoutShell() {
  return (
    <CompanySettingsProvider>
      <CompanySettingsLayoutInner />
    </CompanySettingsProvider>
  );
}

export default memo(CompanySettingsLayoutShell);
