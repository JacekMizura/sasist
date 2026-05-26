import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import WmsModuleLayout from "../../components/layout/WmsModuleLayout";
import { PURCHASING_TABS } from "../../modules/purchasing/purchasingTabs";

/**
 * Zakupy i planowanie — zakładki u góry; dane dostawców (MOQ, ceny) w module Asortyment → Dostawcy.
 */
export default function PurchasingLayout() {
  const location = useLocation();
  const tabLinkSearch = useMemo(() => {
    const tid = new URLSearchParams(location.search).get("tenant_id");
    return tid != null && tid !== "" ? `?tenant_id=${encodeURIComponent(tid)}` : "";
  }, [location.search]);

  return (
    <WmsModuleLayout
      tabs={PURCHASING_TABS}
      tabLinkSearch={tabLinkSearch || undefined}
      exact={false}
      flushHorizontal
    />
  );
}
