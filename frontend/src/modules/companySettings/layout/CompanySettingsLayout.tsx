import { Loader2, Plus } from "lucide-react";
import { memo, useEffect } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import PageLayout from "../../../components/layout/PageLayout";
import { SettingsModuleStack } from "../../../components/layout/SettingsModuleStack";
import { isSuperRole } from "../../../auth/isSuperRole";
import { useAuth } from "../../../context/AuthContext";
import { COMPANY_SETTINGS_TABS } from "../companySettingsTabs";
import { companyOrangeCtaClass } from "../companySettingsUi";
import { CompanySettingsProvider, useCompanySettings } from "../context/CompanySettingsContext";

const LEGACY_TAB_ROUTES: Record<string, string> = {
  magazyny: "/settings/company/warehouses",
  tenanty: "/settings/company/tenants",
  branding: "/settings/company/branding",
};

function CompanySettingsChrome() {
  const { user, loading: authLoading, hasPermission, sessionReady } = useAuth();
  const canEdit =
    hasPermission("settings.users") || hasPermission("settings.company") || isSuperRole(user?.role ?? "");
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openWarehouseCreate, openTenantCreate } = useCompanySettings();

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

  const isWarehouses = location.pathname.includes("/warehouses");
  const isTenants = location.pathname.includes("/tenants");

  const tabsTrailing = isWarehouses ? (
    <button type="button" className={companyOrangeCtaClass} onClick={openWarehouseCreate}>
      <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      Nowy magazyn
    </button>
  ) : isTenants ? (
    <button type="button" className={companyOrangeCtaClass} onClick={openTenantCreate}>
      <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      Nowa firma
    </button>
  ) : null;

  return (
    <PageLayout fullBleed>
      <SettingsModuleStack
        breadcrumbs={[
          { label: "Ustawienia", to: "/settings/wms" },
          { label: "Firma" },
        ]}
        hideTitle
        tabs={COMPANY_SETTINGS_TABS}
        tabsExact
        tabsChrome="bare"
        tabsTrailing={tabsTrailing}
        tabsAriaLabel="Firma — zakładki"
      >
        <Outlet />
      </SettingsModuleStack>
    </PageLayout>
  );
}

function CompanySettingsLayoutShell() {
  return (
    <CompanySettingsProvider>
      <CompanySettingsChrome />
    </CompanySettingsProvider>
  );
}

export default memo(CompanySettingsLayoutShell);
