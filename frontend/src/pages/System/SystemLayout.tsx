import WmsModuleLayout from "../../components/layout/WmsModuleLayout";
import { useSystemTabs } from "../../constants/systemTabs";
import { useLabels } from "../../labels";

/**
 * System module: Health, Database Size, API Metrics, Error Logs, App Dictionary (SUPER_ADMIN).
 */
export default function SystemLayout() {
  useLabels();
  const tabs = useSystemTabs();
  return <WmsModuleLayout tabs={tabs} exact />;
}
