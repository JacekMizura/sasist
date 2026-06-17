import { memo } from "react";
import PurchasingPoPage from "../../../pages/purchasing/PurchasingPoPage";

function PurchaseOrdersViewInner() {
  return <PurchasingPoPage />;
}

export default memo(PurchaseOrdersViewInner);
