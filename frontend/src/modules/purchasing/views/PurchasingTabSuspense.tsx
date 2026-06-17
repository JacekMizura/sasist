import { Suspense, type ReactNode } from "react";
import { PurchasingTabFallback } from "./PurchasingTabFallback";

export function PurchasingTabSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PurchasingTabFallback />}>{children}</Suspense>;
}
