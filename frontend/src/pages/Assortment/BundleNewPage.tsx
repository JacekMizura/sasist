import { useNavigate } from "react-router-dom";

import PageLayout from "../../components/layout/PageLayout";
import { AppPageHeader, appCardShellClass, appPageInnerClass, appPageShellClass } from "../../components/app-shell";
import { UI_STRINGS } from "../../constants/uiStrings";
import { BundleEditModal } from "./BundleEditModal";

const DEFAULT_TENANT = 1;

export default function BundleNewPage() {
  const navigate = useNavigate();
  const goList = () => navigate("/bundles", { replace: true });

  return (
    <PageLayout omitCard fullBleed>
      <div className={appPageShellClass}>
        <div className={appPageInnerClass}>
          <AppPageHeader
            title="Nowy zestaw"
            breadcrumbs={[
              { label: "Asortyment", to: "/products/list" },
              { label: UI_STRINGS.navigation.bundles, to: "/bundles" },
              { label: "Nowy" },
            ]}
          />
          <div className={`${appCardShellClass} mt-2`}>
            <BundleEditModal variant="page" tenantId={DEFAULT_TENANT} bundleId={null} onClose={goList} onSaved={() => {}} />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
