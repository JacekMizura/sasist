import WmsModuleLayout from "../../components/layout/WmsModuleLayout";
import { SYSTEM_TABS } from "../../constants/systemTabs";

/**
 * System module: Health, Database Size, API Metrics, Error Logs.
 */
export default function SystemLayout() {
  return <WmsModuleLayout tabs={SYSTEM_TABS} exact />;
}
