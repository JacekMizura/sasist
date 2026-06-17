import { memo } from "react";
import PurchasingForecastPage from "../../../pages/purchasing/PurchasingForecastPage";

function ForecastViewInner() {
  return <PurchasingForecastPage />;
}

export default memo(ForecastViewInner);
