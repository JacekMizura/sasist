import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { listInventoryDocuments, type InventoryDocumentRead } from "../../api/inventoryCountApi";
import { InventoryDocumentStatusBadge } from "../../modules/inventoryCount/erp/components/InventoryDocumentStatusBadge";
import { InventoryPageHeader } from "../../modules/inventoryCount/erp/components/InventoryPageShell";
import { ERP_INV } from "../../modules/inventoryCount/erp/erpInventoryTheme";
import { inventoryTypeLabel } from "../../modules/inventoryCount/inventoryCountUiLabels";
import { erpInventoryCountPaths } from "../../modules/inventoryCount/inventoryCountPaths";
import { useWarehouse } from "../../context/WarehouseContext";

export default function InventoryCountDocumentsPage() {
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const [rows, setRows] = useState<InventoryDocumentRead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listInventoryDocuments(tenantId, { warehouseId: warehouse?.id });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouse?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      <InventoryPageHeader
        title="Dokumenty inwentaryzacji"
        subtitle="Lista dokumentów liczenia i statusów zatwierdzenia."
        actions={
          <Link
            to={erpInventoryCountPaths.wizard}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Nowa inwentaryzacja
          </Link>
        }
      />

      {loading ? (
        <p className="text-xs text-slate-500">Wczytywanie…</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className={ERP_INV.table}>
            <thead>
              <tr>
                <th className={ERP_INV.th}>Numer</th>
                <th className={ERP_INV.th}>Typ</th>
                <th className={ERP_INV.th}>Status</th>
                <th className={`${ERP_INV.th} text-right`}>Pokrycie</th>
                <th className={`${ERP_INV.th} text-right`}>Różnice</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={ERP_INV.row}>
                  <td className={ERP_INV.td}>
                    <Link to={erpInventoryCountPaths.document(r.id)} className="font-semibold text-slate-900 hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className={ERP_INV.td}>{inventoryTypeLabel(r.inventory_type)}</td>
                  <td className={ERP_INV.td}>
                    <InventoryDocumentStatusBadge status={r.status} />
                  </td>
                  <td className={`${ERP_INV.td} text-right tabular-nums`}>{r.coverage_percent}%</td>
                  <td className={`${ERP_INV.td} text-right tabular-nums`}>{r.difference_lines}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-500">
                    Brak dokumentów. Utwórz inwentaryzację w kreatorze.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
