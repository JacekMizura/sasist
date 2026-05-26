import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import WmsModuleLayout from "../../components/layout/WmsModuleLayout";
import { SUPPLIER_MODULE_TABS } from "../../modules/suppliers/supplierModuleTabs";

export default function SuppliersLayout() {
  const location = useLocation();
  const tabLinkSearch = useMemo(() => {
    const tid = new URLSearchParams(location.search).get("tenant_id");
    return tid != null && tid !== "" ? `?tenant_id=${encodeURIComponent(tid)}` : "";
  }, [location.search]);

  return (
    <WmsModuleLayout
      tabs={SUPPLIER_MODULE_TABS}
      tabLinkSearch={tabLinkSearch || undefined}
      exact
      flushHorizontal
    />
  );
}
