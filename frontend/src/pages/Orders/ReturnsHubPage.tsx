import { Navigate } from "react-router-dom";

/** Legacy `/returns` URL: office list lives under Orders → Zwroty (`/orders/returns`). */
export default function ReturnsHubPage() {
  console.log("[PAGE] Returns render start");
  return <Navigate to="/orders/returns" replace />;
}
