import WmsModuleLayout from "../../components/layout/WmsModuleLayout";
import { WAREHOUSE_MATERIALS_MODULE_TABS } from "../../modules/warehouseMaterials/warehouseMaterialsModuleTabs";

export default function WarehouseMaterialsLayout() {
  return (
    <WmsModuleLayout tabs={WAREHOUSE_MATERIALS_MODULE_TABS} exact={false} flushHorizontal />
  );
}
