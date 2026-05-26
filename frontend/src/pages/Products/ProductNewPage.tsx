import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";
import PageLayout from "../../components/layout/PageLayout";
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
    <PageLayout omitCard fullBleed>
      <div className="w-full bg-slate-100 pb-8 pt-2 font-sans text-base antialiased">
        <div className="w-full max-w-none px-2 sm:px-3 lg:px-4">
          <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06),0_12px_40px_-12px_rgba(15,23,42,0.07)]">
            <ProductEditModal
              variant="page"
              tenants={tenants}
              product={null}
              onSave={() => {
                goProducts();
              }}
              onClose={goProducts}
            />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
