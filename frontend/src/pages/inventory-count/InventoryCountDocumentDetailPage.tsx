import { Link } from "react-router-dom";

import { erpInventoryCountPaths } from "../../modules/inventoryCount/inventoryCountPaths";

/** Document detail placeholder — reconciliation UI in phase 2. */
export default function InventoryCountDocumentDetailPage() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-sm text-slate-600">
        Szczegóły dokumentu, różnice, zatwierdzanie i korekty RW/PW — kolejna iteracja modułu.
      </p>
      <Link to={erpInventoryCountPaths.documents} className="mt-4 inline-block text-sm font-medium text-teal-700">
        ← Lista dokumentów
      </Link>
    </div>
  );
}
