import { UserRound } from "lucide-react";

import { createStubOrderModule } from "./stubModule";

export const operatorModule = createStubOrderModule(
  "operator",
  "Operator",
  "Klient",
  UserRound,
  "Operator — w przygotowaniu.",
);
