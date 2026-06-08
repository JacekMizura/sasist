import { Link } from "react-router-dom";

import type { InventoryDocumentRead } from "@/api/inventoryCountApi";
import { erpInventoryCountPaths } from "../../inventoryCountPaths";
import { inventoryTypeLabel } from "../../inventoryCountUiLabels";
import InventoryStatusBadge from "./InventoryStatusBadge";

type Props = {
  documents: InventoryDocumentRead[];
  loading?: boolean;
  newInventoryPath: string;
};

/** Documents list — pixel match uploaded mockup. */
export default function InventoryDocumentsView({ documents, loading, newInventoryPath }: Props) {
  return (
    <div className="animate-in fade-in space-y-6 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Dokumenty inwentaryzacji</h2>
          <p className="mt-1 text-sm text-slate-500">Lista dokumentów liczenia i statusów zatwierdzenia.</p>
        </div>
        <Link
          to={newInventoryPath}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          Nowa inwentaryzacja
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-500">Wczytywanie…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Numer</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Typ</th>
                  <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Pokrycie
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Różnice
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-medium text-slate-900">
                      <Link to={erpInventoryCountPaths.document(doc.id)} className="hover:underline">
                        {doc.number}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{inventoryTypeLabel(doc.inventory_type)}</td>
                    <td className="px-6 py-4">
                      <InventoryStatusBadge status={doc.status} />
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums text-slate-600">{doc.coverage_percent}%</td>
                    <td className="px-6 py-4 text-right tabular-nums text-slate-600">{doc.difference_lines}</td>
                  </tr>
                ))}
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                      Brak dokumentów. Utwórz inwentaryzację w kreatorze.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
