import { Navigate, useParams } from "react-router-dom";

/**
 * Legacy full-page editor routes redirect into the split-pane workspace
 * (`DocumentSeriesListPage` on `/documents/series/*`).
 */
export default function DocumentSeriesEditPage() {
  const { id } = useParams<{ id: string }>();
  if (!id || id === "new") {
    return <Navigate to="/documents/series/new" replace />;
  }
  return <Navigate to={`/documents/series/${encodeURIComponent(id)}`} replace />;
}
