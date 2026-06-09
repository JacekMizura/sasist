import { Link } from "react-router-dom";

import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import {
  moduleListDataCardClass,
  moduleListPageShellClass,
  moduleListTableInteriorClass,
} from "@/components/listPage/moduleListLayoutTokens";
import {
  panelListDenseRowClass,
  panelListDenseTableClass,
  panelListDenseTableScrollWrapClass,
  panelListDenseTdBase,
  panelListDenseThBase,
  panelListDenseTheadClass,
} from "@/components/operational";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { inventoryTypeLabel } from "../../inventoryCountUiLabels";
import InventoryStatusBadge from "./InventoryStatusBadge";

type Props = {
  documents: InventoryDocumentRead[];
  loading?: boolean;
};

/** Documents list — standard ERP dense table (shell in {@link InventoryLayout}). */
export default function InventoryDocumentsView({ documents, loading }: Props) {
  return (
    <div className={moduleListPageShellClass}>
      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      ) : documents.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-600">
          <p>Brak dokumentów inwentaryzacji.</p>
          <p className="mt-2 text-xs text-slate-500">Utwórz inwentaryzację w zakładce „Nowa inwentaryzacja”.</p>
        </div>
      ) : (
        <div className={moduleListDataCardClass}>
          <div className={moduleListTableInteriorClass}>
            <div className={panelListDenseTableScrollWrapClass}>
              <table className={panelListDenseTableClass}>
                <thead className={panelListDenseTheadClass}>
                  <tr>
                    <th className={`${panelListDenseThBase} text-left`}>Numer</th>
                    <th className={`${panelListDenseThBase} text-left`}>Typ</th>
                    <th className={`${panelListDenseThBase} text-left`}>Status</th>
                    <th className={`${panelListDenseThBase} text-right`}>Pokrycie</th>
                    <th className={`${panelListDenseThBase} text-right`}>Różnice</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id} className={panelListDenseRowClass}>
                      <td className={`${panelListDenseTdBase} font-semibold text-slate-900`}>
                        <Link
                          to={erpInventoryCountPaths.document(doc.id)}
                          className="text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                        >
                          {doc.number}
                        </Link>
                      </td>
                      <td className={`${panelListDenseTdBase} text-slate-700`}>
                        {inventoryTypeLabel(doc.inventory_type)}
                      </td>
                      <td className={panelListDenseTdBase}>
                        <InventoryStatusBadge status={doc.status} />
                      </td>
                      <td className={`${panelListDenseTdBase} text-right tabular-nums text-slate-800`}>
                        {doc.coverage_percent}%
                      </td>
                      <td className={`${panelListDenseTdBase} text-right tabular-nums text-slate-800`}>
                        {doc.difference_lines}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
