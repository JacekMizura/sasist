import { useNavigate } from "react-router-dom";

import { CatalogEntityPageShell } from "../../components/catalog";
import { BundleEditModal } from "./BundleEditModal";

const DEFAULT_TENANT = 1;

export default function BundleNewPage() {
  const navigate = useNavigate();
  const goList = () => navigate("/bundles", { replace: true });

  return (
    <CatalogEntityPageShell>
      <BundleEditModal variant="page" tenantId={DEFAULT_TENANT} bundleId={null} onClose={goList} onSaved={() => {}} />
    </CatalogEntityPageShell>
  );
}
