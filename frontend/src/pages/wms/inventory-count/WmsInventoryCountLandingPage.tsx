import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";

import { erpInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import { WMS_INV } from "@/modules/inventoryCount/ui/wms/theme";
import { useAuth } from "@/context/AuthContext";

/** Right pane when no document route is active — sidebar holds the document list. */
export default function WmsInventoryCountLandingPage() {
  const { hasPermission } = useAuth();
  const canCreateDocument = hasPermission("inventory.submit");

  return (
    <div className="mx-auto flex max-w-lg flex-col items-start justify-center py-12">
      <p className={WMS_INV.textLabel}>Inwentaryzacja WMS</p>
      <h1 className="mt-2 text-xl font-bold text-slate-900">Wybierz dokument z listy po lewej</h1>
      <p className={`mt-2 ${WMS_INV.textSub}`}>
        Zeskanuj lokalizację i policz stany w wybranym dokumencie inwentaryzacji.
      </p>

      <div className={`${WMS_INV.card} ${WMS_INV.cardPad} mt-8 w-full border-dashed`}>
        <ClipboardList className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
        <p className="mt-3 text-sm font-bold text-slate-700">Brak wybranego dokumentu</p>
        <p className="mt-1 text-xs text-slate-500">
          Kliknij dokument na liście i użyj przycisku „Kontynuuj” lub „Liczenie”.
        </p>
        {canCreateDocument ? (
          <Link to={erpInventoryCountPaths.wizard} className={`${WMS_INV.btnPrimary} mt-4`}>
            Utwórz dokument (ERP)
          </Link>
        ) : null}
      </div>
    </div>
  );
}
