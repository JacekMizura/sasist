import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../api/axios";
import { CatalogEntityPageShell } from "../../components/catalog";
import { ProductEditModal } from "./ProductEditModal";

type Tenant = { id: number; name: string };

/**
 * /products/new — full-page product create (no modal).
 */
export default function ProductNewPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    api
      .get<Tenant[]>("/tenants/")
      .then((res) => setTenants(Array.isArray(res.data) ? res.data : []))
      .catch(() => setTenants([]));
  }, []);

  const goProducts = () => navigate("/products", { replace: true });

  return (
    <CatalogEntityPageShell>
      <ProductEditModal variant="page" tenants={tenants} product={null} onSave={goProducts} onClose={goProducts} />
    </CatalogEntityPageShell>
  );
}
