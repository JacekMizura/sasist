import type { CartsFleetListProps } from "../../modules/carts/cartList/CartsFleetList";
import { CartsFleetList } from "../../modules/carts/cartList/CartsFleetList";

/** @deprecated Użyj {@link CartsFleetList} z `cartType="MULTI"`. */
export default function CartList(props: Omit<CartsFleetListProps, "cartType">) {
  return <CartsFleetList cartType="MULTI" {...props} />;
}
