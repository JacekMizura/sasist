import { Navigate, useLocation } from "react-router-dom";

function withSearch(path: string, search: string): string {
  if (!search) return path;
  return `${path}${search.startsWith("?") ? search : `?${search}`}`;
}

export function PurchasingRedirectTo({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={withSearch(to, location.search)} replace />;
}
