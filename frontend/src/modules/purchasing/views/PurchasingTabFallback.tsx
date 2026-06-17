import { memo } from "react";
import { PurchasingContentArea } from "../ui";

function PurchasingTabFallbackInner() {
  return (
    <PurchasingContentArea>
      <p className="text-sm text-slate-500">Ładowanie widoku…</p>
    </PurchasingContentArea>
  );
}

export const PurchasingTabFallback = memo(PurchasingTabFallbackInner);
