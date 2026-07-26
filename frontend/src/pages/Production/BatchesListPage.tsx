import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, FileText, Package } from "lucide-react";
import toast from "react-hot-toast";

import { useWarehouse } from "../../context/WarehouseContext";
import {
  listProductionBatches,
  openBulkProductionCardsPdf,
  type ProductionBatchRead,
  type ProductionBatchStatus,
} from "../../api/productionApi";
import { AppEmptyState } from "../../components/app-shell";
import { PageHeader, PrimaryButton, StatusBadge, type StatusTone } from "@/design-system";
import {
  productsListActionsCellClass,
  productsListActionsInnerClass,
  productsListActionsThClass,
} from "../../components/products/productList/productsListTableTokens";
import {
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListThClass,
  moduleListTheadClass,
  moduleTableCardClass,
} from "../../components/listPage/moduleList";
import { BATCH_STATUS_LABEL } from "./productionUi";
import { erpProductionPaths } from "./productionPaths";
import { ProgressBar } from "./components/ProgressBar";
import { ProductionRowActionsMenu } from "./components/ProductionRowActionsMenu";
import {
  productionModuleListTdClass,
  productionModuleListThClass,
  productionPageStackClass,
  productionPageTitleClass,
} from "./productionLayoutTokens";

const DEFAULT_TENANT = 1;

function batchStatusTone(status: ProductionBatchStatus): StatusTone {
  switch (status) {
    case "completed":
    case "putaway":
    case "awaiting_putaway":
      return "success";
    case "in_progress":
    case "collecting":
      return "info";
    case "planned":
      return "neutral";
    case "cancelled":
      return "danger";
    case "draft":
    default:
      return "warning";
  }
}

type Props = {
  embedded?: boolean;
};

export default function BatchesListPage({ embedded = false }: Props) {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [batches, setBatches] = useState<ProductionBatchRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [printBusy, setPrintBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listProductionBatches(tenantId, { warehouse_id: warehouseId });
      setBatches(rows.filter((b) => b.status !== "completed" && b.status !== "cancelled"));
    } catch {
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === batches.length) setSelected(new Set());
    else setSelected(new Set(batches.map((b) => b.id)));
  };

  const printSelectedCards = async () => {
    if (warehouseId == null || selected.size === 0) return;
    setPrintBusy(true);
    try {
      await openBulkProductionCardsPdf(tenantId, [...selected], warehouseId);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Nie udało się wygenerować kart produkcyjnych.";
      toast.error(message);
    } finally {
      setPrintBusy(false);
    }
  };

  const rowTd = embedded ? `${productionModuleListTdClass} !py-3.5` : productionModuleListTdClass;

  const table = loading ? (
    <p className="text-sm text-slate-500">Wczytywanie…</p>
  ) : batches.length === 0 ? (
    <AppEmptyState
      icon={Package}
      title="Brak aktywnych partii"
      description="Utwórz partię masową, aby zaplanować produkcję wieloproduktową."
      action={
        <button
          type="button"
          className="text-sm font-semibold text-amber-700 hover:underline"
          onClick={() => navigate(erpProductionPaths.recipes)}
        >
          Przejdź do receptur
        </button>
      }
    />
  ) : (
    <div className={moduleTableCardClass}>
      {embedded && selected.size > 0 ? (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <p className="text-sm text-slate-600">
            Zaznaczono: <strong>{selected.size}</strong>
          </p>
          <PrimaryButton type="button" disabled={printBusy} onClick={() => void printSelectedCards()}>
            <FileText className="h-4 w-4" aria-hidden />
            {printBusy ? "Generowanie PDF…" : "Drukuj karty produkcyjne"}
          </PrimaryButton>
        </div>
      ) : null}
      <div className={moduleListTableScrollClass}>
        <table className={moduleListTableClass} style={{ minWidth: embedded ? 760 : 900 }}>
          <thead className={moduleListTheadClass}>
            <tr>
              {embedded ? (
                <th className={moduleListThClass}>
                  <input
                    type="checkbox"
                    aria-label="Zaznacz wszystkie partie"
                    checked={batches.length > 0 && selected.size === batches.length}
                    onChange={toggleAll}
                  />
                </th>
              ) : null}
              <th className={productionModuleListThClass}>Partia</th>
              <th className={productionModuleListThClass}>Produkty</th>
              <th className={`${productionModuleListThClass} text-right`}>Ilość</th>
              <th className={productionModuleListThClass}>Status</th>
              <th className={productionModuleListThClass}>Postęp</th>
              <th className={productionModuleListThClass}>Materiały</th>
              {embedded ? null : <th className={productionModuleListThClass}>Operator</th>}
              <th className={productionModuleListThClass}>Termin</th>
              <th className={productsListActionsThClass}>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="group border-b border-slate-100 hover:bg-slate-50/70">
                {embedded ? (
                  <td className={rowTd}>
                    <input
                      type="checkbox"
                      aria-label={`Zaznacz partię ${b.number}`}
                      checked={selected.has(b.id)}
                      onChange={() => toggleSelect(b.id)}
                    />
                  </td>
                ) : null}
                <td className={`${rowTd} font-mono font-medium text-slate-900`}>{b.number}</td>
                <td className={rowTd}>{b.products_count ?? b.lines.length}</td>
                <td className={`${rowTd} text-right tabular-nums`}>{b.total_planned_units ?? 0}</td>
                <td className={rowTd}>
                  <StatusBadge tone={batchStatusTone(b.status)} density="comfortable">
                    {BATCH_STATUS_LABEL[b.status]}
                  </StatusBadge>
                </td>
                <td className={`${rowTd} min-w-[140px]`}>
                  <ProgressBar value={b.progress_percent ?? 0} tone={b.has_shortages ? "amber" : "emerald"} />
                </td>
                <td className={rowTd}>
                  {b.has_shortages ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                      Braki
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-700">OK</span>
                  )}
                </td>
                {embedded ? null : (
                  <td className={`${rowTd} text-slate-600`}>{b.operator_name ?? "—"}</td>
                )}
                <td className={`${rowTd} text-slate-600`}>{(b.created_at ?? "").slice(0, 10) || "—"}</td>
                <td className={productsListActionsCellClass} onClick={(e) => e.stopPropagation()}>
                  <div className={productsListActionsInnerClass}>
                    <ProductionRowActionsMenu
                      ariaLabel={`Akcje ${b.number}`}
                      actions={[
                        { id: "open", label: "Otwórz", onClick: () => navigate(erpProductionPaths.batch(b.id)) },
                        { id: "edit", label: "Edytuj", onClick: () => navigate(erpProductionPaths.batch(b.id)) },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (embedded) {
    return table;
  }

  return (
    <div className={productionPageStackClass}>
      <PageHeader title={<h1 className={productionPageTitleClass}>Partie produkcyjne</h1>}>
        <div className="space-y-4">{table}</div>
      </PageHeader>
    </div>
  );
}
