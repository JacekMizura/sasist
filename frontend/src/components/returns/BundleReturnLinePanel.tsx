import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  getOrderBundleReturnTree,
  updateWmsReturnBundleComponents,
} from "../../api/wmsReturnsApi";
import type {
  WmsReturnBundleComponentIn,
  WmsReturnBundleComponentRead,
  WmsReturnBundleTreeNodeRead,
} from "../../types/wmsReturn";

type Props = {
  tenantId: number;
  warehouseId: number;
  returnId: number;
  rmzLineId: number;
  orderId: number;
  orderLineId: number;
  bundleName?: string | null;
  initialComponents?: WmsReturnBundleComponentRead[];
  disabled?: boolean;
  onSaved?: () => void;
};

type RowState = {
  snapshotId: number;
  label: string;
  soldQty: number;
  maxReturnable: number;
  unitPrice: number;
  checked: boolean;
  returnedQty: number;
  acceptedQty: number;
  lots: Array<{ lot_number: string; picked_qty?: number }>;
};

export function BundleReturnLinePanel({
  tenantId,
  warehouseId,
  returnId,
  rmzLineId,
  orderId,
  orderLineId,
  bundleName,
  initialComponents,
  disabled = false,
  onSaved,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [treeNode, setTreeNode] = useState<WmsReturnBundleTreeNodeRead | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tree = await getOrderBundleReturnTree(orderId, tenantId, warehouseId);
        if (cancelled) return;
        const node = tree.find((n) => n.order_line_id === orderLineId) ?? null;
        setTreeNode(node);
        if (!node) return;
        const savedBySnap = new Map((initialComponents ?? []).map((c) => [c.snapshot_id, c]));
        setRows(
          node.components.map((c) => {
            const saved = savedBySnap.get(c.snapshot_id);
            const returned = saved?.returned_qty ?? 0;
            return {
              snapshotId: c.snapshot_id,
              label: c.component_name,
              soldQty: c.sold_qty,
              maxReturnable: c.max_returnable_qty,
              unitPrice: c.unit_price_snapshot,
              checked: returned > 0,
              returnedQty: returned,
              acceptedQty: saved?.accepted_qty ?? returned,
              lots: c.lots ?? [],
            };
          }),
        );
      } catch {
        if (!cancelled) toast.error("Nie udało się wczytać składników zestawu");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, orderLineId, tenantId, warehouseId, initialComponents]);

  const refundPreview = useMemo(
    () =>
      rows.reduce((sum, r) => {
        if (!r.checked || r.acceptedQty <= 0) return sum;
        return sum + r.unitPrice * r.acceptedQty;
      }, 0),
    [rows],
  );

  const toggleRow = useCallback((snapshotId: number, checked: boolean) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.snapshotId !== snapshotId) return r;
        const qty = checked ? Math.min(1, r.maxReturnable) || r.soldQty : 0;
        return {
          ...r,
          checked,
          returnedQty: checked ? (r.returnedQty > 0 ? r.returnedQty : qty) : 0,
          acceptedQty: checked ? (r.acceptedQty > 0 ? r.acceptedQty : qty) : 0,
        };
      }),
    );
  }, []);

  const setQty = useCallback((snapshotId: number, field: "returnedQty" | "acceptedQty", value: number) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.snapshotId !== snapshotId) return r;
        const cap = Math.max(0, r.maxReturnable);
        const v = Math.min(Math.max(0, Math.floor(value)), cap);
        if (field === "returnedQty") {
          return { ...r, returnedQty: v, checked: v > 0, acceptedQty: Math.min(r.acceptedQty, v) };
        }
        return { ...r, acceptedQty: Math.min(v, r.returnedQty), checked: r.returnedQty > 0 };
      }),
    );
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const components: WmsReturnBundleComponentIn[] = rows
        .filter((r) => r.returnedQty > 0)
        .map((r) => ({
          snapshot_id: r.snapshotId,
          returned_qty: r.returnedQty,
          accepted_qty: r.acceptedQty,
          decision: r.acceptedQty < r.returnedQty ? "PARTIAL" : "OK",
        }));
      await updateWmsReturnBundleComponents(returnId, rmzLineId, tenantId, { components }, warehouseId);
      toast.success("Zapisano składniki zestawu");
      onSaved?.();
    } catch {
      toast.error("Nie udało się zapisać składników zestawu");
    } finally {
      setSaving(false);
    }
  }, [rows, returnId, rmzLineId, tenantId, warehouseId, onSaved]);

  if (!treeNode || treeNode.components.length === 0) return null;

  const title = bundleName || treeNode.bundle_name || "Zestaw";

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs font-bold uppercase tracking-wide text-violet-900">{title}</span>
        <span className="text-violet-700">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded ? (
        <div className="mt-2 space-y-2">
          {rows.map((r) => (
            <label
              key={r.snapshotId}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-100 bg-white px-2 py-2 text-sm"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-violet-300"
                checked={r.checked}
                disabled={disabled || r.maxReturnable <= 0}
                onChange={(e) => toggleRow(r.snapshotId, e.target.checked)}
              />
              <span className="min-w-[8rem] flex-1 font-medium text-slate-900">
                {r.label} ×{r.soldQty}
              </span>
              {r.lots.length > 0 ? (
                <span className="w-full basis-full text-[11px] font-semibold text-violet-800 pl-6">
                  Partia: {r.lots.map((l) => l.lot_number).filter(Boolean).join(", ")}
                </span>
              ) : null}
              <span className="text-xs tabular-nums text-slate-500">{r.unitPrice.toFixed(2)} zł/szt.</span>
              {r.checked ? (
                <>
                  <span className="text-xs text-slate-600">Wróciło</span>
                  <input
                    type="number"
                    min={0}
                    max={r.maxReturnable}
                    className="w-14 rounded border border-slate-200 px-1 py-0.5 text-xs tabular-nums"
                    value={r.returnedQty}
                    disabled={disabled}
                    onChange={(e) => setQty(r.snapshotId, "returnedQty", Number(e.target.value))}
                  />
                  <span className="text-xs text-slate-600">Przyjęto</span>
                  <input
                    type="number"
                    min={0}
                    max={r.returnedQty}
                    className="w-14 rounded border border-slate-200 px-1 py-0.5 text-xs tabular-nums"
                    value={r.acceptedQty}
                    disabled={disabled}
                    onChange={(e) => setQty(r.snapshotId, "acceptedQty", Number(e.target.value))}
                  />
                </>
              ) : null}
            </label>
          ))}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-semibold tabular-nums text-violet-900">
              Refund (snapshot): {refundPreview.toFixed(2)} zł
            </span>
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => void save()}
              className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-50"
            >
              {saving ? "Zapis…" : "Zapisz składniki"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
