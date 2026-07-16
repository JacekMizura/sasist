import { Loader2 } from "lucide-react";
import { memo, useEffect } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import PageLayout from "../../../components/layout/PageLayout";
import { TabsNav } from "../../../components/layout/TabsNav";
import { flatSectionDividerClass } from "../../../components/layout/flatSectionTokens";
import { ModuleListBreadcrumb } from "../../../components/listPage/moduleList";
import { isSuperRole } from "../../../auth/isSuperRole";
import { useAuth } from "../../../context/AuthContext";
import { PurchasingContentArea, purchasingLinkClass } from "../../purchasing/ui";
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TabsNav
          items={COMPANY_SETTINGS_TABS}
          exact
          aria-label="Firma — zakładki"
          className="min-w-0 flex-1 gap-8"
        />
        {location.pathname.includes("/branding") ? (
          <Link to="/settings/printers" className={`${purchasingLinkClass} shrink-0 pb-2.5 text-sm`}>
            Drukarki i kalibracja etykiet →
          </Link>
        ) : null}
      </div>
      <div className={`${flatSectionDividerClass} mt-2`} aria-hidden />
      <div className="pt-4">
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
