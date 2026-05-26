import { useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";

import PageLayout from "../../components/layout/PageLayout";
import WmsModuleLayout from "../../components/layout/WmsModuleLayout";
import { PRODUCT_MODULE_TABS } from "../../modules/products/productModuleTabs";

const FULL_PAGE_SUBPATH = /^\/products\/(new|\d+\/edit)$/;
const PRODUCT_DETAIL = /^\/products\/\d+$/;
const PRODUCT_PROFITABILITY = /^\/products\/profitability(?:\/.*)?$/;

export default function ProductsLayout() {
  const location = useLocation();
  const { pathname } = location;
  const tabLinkSearch = useMemo(() => {
    const tid = new URLSearchParams(location.search).get("tenant_id");
    return tid != null && tid !== "" ? `?tenant_id=${encodeURIComponent(tid)}` : "";
  }, [location.search]);

  const fullPageForm = FULL_PAGE_SUBPATH.test(pathname);
  const productDetail = PRODUCT_DETAIL.test(pathname);
  const profitabilityStandalone = PRODUCT_PROFITABILITY.test(pathname);

  if (fullPageForm || productDetail) {
    return <Outlet />;
  }

  if (profitabilityStandalone) {
    return (
      <PageLayout fullBleed>
        <Outlet />
      </PageLayout>
    );
  }

  /** Lista produktów: bez zakładek. */
  if (pathname === "/products/list") {
    return (
      <PageLayout fullBleed>
        <Outlet />
      </PageLayout>
    );
  }

  return (
    <WmsModuleLayout tabs={PRODUCT_MODULE_TABS} tabLinkSearch={tabLinkSearch || undefined} exact />
  );
}
