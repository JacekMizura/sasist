import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { getBundle, type BundleRead } from "../../api/bundlesApi";
import PageLayout from "../../components/layout/PageLayout";
import { AppPageHeader, appCardShellClass, appPageInnerClass, appPageShellClass } from "../../components/app-shell";
import { UI_STRINGS } from "../../constants/uiStrings";
import { BundleEditModal } from "./BundleEditModal";
import type { BundleEditTabId } from "./bundleEditTypes";
import { BUNDLE_EDIT_TABS } from "./bundleEditTypes";

const DEFAULT_TENANT = 1;

export default function BundleEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab = BUNDLE_EDIT_TABS.some((t) => t.id === tabParam) ? (tabParam as BundleEditTabId) : undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<BundleRead | null>(null);

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

  if (loading) {
    return (
      <PageLayout omitCard fullBleed>
        <div className={appPageShellClass}>
          <div className={appPageInnerClass}>
            <div className={`${appCardShellClass} flex min-h-[40vh] items-center justify-center text-[13px] text-slate-500`}>
              Ładowanie…
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error || bundle == null) {
    return (
      <PageLayout omitCard fullBleed>
        <div className={appPageShellClass}>
          <div className={appPageInnerClass}>
            <div className={`${appCardShellClass} p-4`}>
              <p className="text-[13px] text-red-700">{error ?? "Brak danych."}</p>
              <button type="button" onClick={goList} className="mt-3 rounded-md border border-slate-200 px-3 py-1.5 text-[13px] hover:bg-slate-50">
                Wróć do listy
              </button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout omitCard fullBleed>
      <div className={appPageShellClass}>
        <div className={appPageInnerClass}>
          <AppPageHeader
            title={bundle.name}
            breadcrumbs={[
              { label: "Asortyment", to: "/products/list" },
              { label: UI_STRINGS.navigation.bundles, to: "/bundles" },
              { label: bundle.name },
            ]}
          />
          <div className={`${appCardShellClass} mt-2`}>
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
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
