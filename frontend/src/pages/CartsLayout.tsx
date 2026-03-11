import WmsModuleLayout from "../components/layout/WmsModuleLayout";
import { CARTS_TABS } from "../modules/carts/cartsTabs";

/**
 * Carts module layout: title + top tabs + Outlet (CartsBulk | CartsBaskets | CartsRacks | CartsZones).
 */
export default function CartsLayout() {
  return <WmsModuleLayout title="Wózki" tabs={CARTS_TABS} />;
}
