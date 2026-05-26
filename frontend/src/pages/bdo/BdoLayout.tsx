import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import WmsModuleLayout from "../../components/layout/WmsModuleLayout";
import { BDO_TABS } from "../../modules/bdo/bdoTabs";

export default function BdoLayout() {
  const location = useLocation();
  const tabLinkSearch = useMemo(() => {
    const tid = new URLSearchParams(location.search).get("tenant_id");
    return tid != null && tid !== "" ? `?tenant_id=${encodeURIComponent(tid)}` : "";
  }, [location.search]);

  return (
    <WmsModuleLayout tabs={BDO_TABS} tabLinkSearch={tabLinkSearch || undefined} exact />
  );
}
