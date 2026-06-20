import { memo } from "react";
import PurchasingForecastPage from "../../../pages/purchasing/PurchasingForecastPage";

function ForecastViewInner() {
  return <PurchasingForecastPage />;
}

const ForecastView = memo(ForecastViewInner);

export default ForecastView;
