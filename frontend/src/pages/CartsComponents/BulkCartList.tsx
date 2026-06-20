import type { CartsFleetListProps } from "../../modules/carts/cartList/CartsFleetList";
import { CartsFleetList } from "../../modules/carts/cartList/CartsFleetList";

/** @deprecated Użyj {@link CartsFleetList} z `cartType="BULK"`. */
export default function BulkCartList(props: Omit<CartsFleetListProps, "cartType">) {
  return <CartsFleetList cartType="BULK" {...props} />;
}
