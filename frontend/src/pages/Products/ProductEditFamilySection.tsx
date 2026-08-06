import { Link } from "react-router-dom";
import { Network } from "lucide-react";

type Props = {
  productId: number;
  tenantId: number;
  familyName?: string | null;
  familyId?: number | null;
};

/**
 * Slim residual under Podstawowe — full family control lives in identity header.
 */
export function ProductEditFamilySection({ familyName, familyId }: Props) {
  return (
    <section className="mt-6 max-w-3xl rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3">
      <div className="flex items-start gap-2 text-sm text-slate-600">
        <Network className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <div>
          <p>
            Rodzina:{" "}
            <span className="font-medium text-slate-800">{familyName?.trim() || "brak"}</span>
            {" — "}
            zarządzanie w bloku <span className="font-medium">Tożsamość produktu</span> powyżej.
          </p>
          {familyId != null ? (
            <Link
              to={`/product-families/${familyId}/edit`}
              className="mt-1 inline-block text-xs font-medium text-blue-700 hover:underline"
            >
              Otwórz rodzinę
            </Link>
          ) : (
            <Link
              to="/product-families"
              className="mt-1 inline-block text-xs font-medium text-blue-700 hover:underline"
            >
              Lista rodzin
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
