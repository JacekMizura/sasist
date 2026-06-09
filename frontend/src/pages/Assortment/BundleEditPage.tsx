import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { getBundle, type BundleRead } from "../../api/bundlesApi";
import { CatalogEntityPageShell } from "../../components/catalog";
import { BundleEditModal } from "./BundleEditModal";
import { BUNDLE_EDIT_TABS, type BundleEditTabId } from "./bundleEditTypes";

const DEFAULT_TENANT = 1;

export default function BundleEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = BUNDLE_EDIT_TABS.some((t) => t.id === tabParam) ? (tabParam as BundleEditTabId) : undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setBundle] = useState<BundleRead | null>(null);

  const bundleId = id != null ? Number(id) : NaN;

  useEffect(() => {
    if (!Number.isFinite(bundleId) || bundleId < 1) {
      setError("Nieprawidłowy identyfikator zestawu.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void getBundle(DEFAULT_TENANT, bundleId)
      .then(setBundle)
      .catch(() => {
        setError("Nie udało się wczytać zestawu.");
        setBundle(null);
      })
      .finally(() => setLoading(false));
  }, [bundleId]);

  const goList = () => navigate("/bundles", { replace: true });

  return (
    <CatalogEntityPageShell
      loading={loading}
      error={
        error ? (
          <>
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
            <button
              type="button"
              onClick={goList}
              className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Wróć do listy
            </button>
          </>
        ) : undefined
      }
    >
      {Number.isFinite(bundleId) && bundleId >= 1 && !error ? (
        <BundleEditModal
          variant="page"
          tenantId={DEFAULT_TENANT}
          bundleId={bundleId}
          initialTab={initialTab}
          onClose={goList}
          onSaved={() => {
            void getBundle(DEFAULT_TENANT, bundleId).then(setBundle).catch(() => {});
          }}
        />
      ) : null}
    </CatalogEntityPageShell>
  );
}
