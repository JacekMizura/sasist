import { memo } from "react";
import PurchasingPlanPage from "../../../pages/purchasing/PurchasingPlanPage";

/** Legacy alias — kanoniczna trasa: /purchasing/plan */
function PurchaseGeneratorViewInner() {
  return <PurchasingPlanPage />;
}

export default memo(PurchaseGeneratorViewInner);
