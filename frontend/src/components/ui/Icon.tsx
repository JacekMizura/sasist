import type { IconProps } from "../../icons/WarehouseIcon";
import WarehouseIcon from "../../icons/WarehouseIcon";
import RacksIcon from "../../icons/RacksIcon";
import ZonesIcon from "../../icons/ZonesIcon";
import CartIcon from "../../icons/CartIcon";
import PackingIcon from "../../icons/PackingIcon";
import ReplenishmentIcon from "../../icons/ReplenishmentIcon";
import SlottingIcon from "../../icons/SlottingIcon";
import RouteOptimizationIcon from "../../icons/RouteOptimizationIcon";
import HeatmapIcon from "../../icons/HeatmapIcon";
import ForecastIcon from "../../icons/ForecastIcon";
import SimulationIcon from "../../icons/SimulationIcon";
import WorkerIcon from "../../icons/WorkerIcon";
import InventoryIcon from "../../icons/InventoryIcon";
import OrdersIcon from "../../icons/OrdersIcon";
import PickingIcon from "../../icons/PickingIcon";
import AnalyticsIcon from "../../icons/AnalyticsIcon";
import PalletIcon from "../../icons/PalletIcon";
import CartonIcon from "../../icons/CartonIcon";
import AisleIcon from "../../icons/AisleIcon";
import BinLocationIcon from "../../icons/BinLocationIcon";
import BasketIcon from "../../icons/BasketIcon";

export type IconName =
  | "warehouse"
  | "racks"
  | "zones"
  | "cart"
  | "packing"
  | "replenishment"
  | "slotting"
  | "routeOptimization"
  | "heatmap"
  | "forecast"
  | "simulation"
  | "worker"
  | "inventory"
  | "orders"
  | "picking"
  | "analytics"
  | "pallet"
  | "carton"
  | "aisle"
  | "binLocation"
  | "basket";

type IconComponent = React.ComponentType<IconProps>;

const iconMap: Record<IconName, IconComponent> = {
  warehouse: WarehouseIcon,
  racks: RacksIcon,
  zones: ZonesIcon,
  cart: CartIcon,
  packing: PackingIcon,
  replenishment: ReplenishmentIcon,
  slotting: SlottingIcon,
  routeOptimization: RouteOptimizationIcon,
  heatmap: HeatmapIcon,
  forecast: ForecastIcon,
  simulation: SimulationIcon,
  worker: WorkerIcon,
  inventory: InventoryIcon,
  orders: OrdersIcon,
  picking: PickingIcon,
  analytics: AnalyticsIcon,
  pallet: PalletIcon,
  carton: CartonIcon,
  aisle: AisleIcon,
  binLocation: BinLocationIcon,
  basket: BasketIcon,
};

export type IconComponentProps = {
  name: IconName;
  size?: number;
  className?: string;
};

export function Icon({ name, size = 24, className }: IconComponentProps) {
  const Component = iconMap[name];
  if (!Component) return null;
  return <Component size={size} className={className} aria-hidden />;
}

export default Icon;
