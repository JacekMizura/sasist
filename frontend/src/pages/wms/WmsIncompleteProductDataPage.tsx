import { Navigate } from "react-router-dom";
import { WMS_ROUTES } from "./wmsRoutes";

/** Legacy URL — przekierowanie do operacyjnego widoku uzupełniania danych. */
export default function WmsIncompleteProductDataPage() {
  return <Navigate to={WMS_ROUTES.productDataCompletion} replace />;
}
