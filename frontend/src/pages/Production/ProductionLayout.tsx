import WmsModuleLayout from "../../components/layout/WmsModuleLayout";
import { PRODUCTION_TABS } from "../../modules/production/productionTabs";

export default function ProductionLayout() {
  return <WmsModuleLayout tabs={PRODUCTION_TABS} exact={false} flushHorizontal />;
}
