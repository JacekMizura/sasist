/** Redirect legacy `/products/kategorie` → Asortyment `/categories`. */
import { Navigate } from "react-router-dom";

export default function ProductCategoriesPage() {
  return <Navigate to="/categories" replace />;
}
