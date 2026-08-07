import { Warehouse } from "lucide-react";

import { createStubOrderModule } from "./stubModule";

export const fulfillmentWarehouseModule = createStubOrderModule(
  "fulfillment_warehouse",
  "Magazyn realizacji",
  "Realizacja",
  Warehouse,
  "Magazyn realizacji — w przygotowaniu.",
);
