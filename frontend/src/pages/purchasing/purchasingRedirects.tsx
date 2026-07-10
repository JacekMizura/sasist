import { Navigate, useLocation } from "react-router-dom";

function withSearch(path: string, search: string): string {
  if (!search) return path;
  return `${path}${search.startsWith("?") ? search : `?${search}`}`;
}

export function PurchasingRedirectTo({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={withSearch(to, location.search)} replace />;
}

export function PurchasingPlanPanelRedirect({ panel }: { panel?: string }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (panel) params.set("panel", panel);
  const q = params.toString();
  return <Navigate to={q ? `/purchasing/plan?${q}` : "/purchasing/plan"} replace />;
}
