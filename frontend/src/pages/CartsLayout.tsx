import WmsModuleLayout from "../components/layout/WmsModuleLayout";
import { CARTS_TABS } from "../modules/carts/cartsTabs";

/**
 * Carts module: top tabs + Outlet (CartsBulk | CartsBaskets | CartsRacks | CartsZones).
 */
export default function CartsLayout() {
  return <WmsModuleLayout tabs={CARTS_TABS} />;
}
