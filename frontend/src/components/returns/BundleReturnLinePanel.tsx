import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  getOrderBundleReturnTree,
  updateWmsReturnBundleComponents,
} from "../../api/wmsReturnsApi";
import type {
  StockIntakeMode,
  WmsReturnBundleComponentIn,
  WmsReturnBundleComponentRead,
  WmsReturnBundleTreeNodeRead,
  WmsReturnLineRead,
} from "../../types/wmsReturn";
import { PrimaryButton } from "../../design-system/PrimaryButton";

type Props = {
  tenantId: number;
  warehouseId: number;
  returnId: number;
  rmzLineId: number;
  orderId: number;
  orderLineId: number;
  bundleName?: string | null;
  initialComponents?: WmsReturnBundleComponentRead[];
  /** Saved STOCK intake fields from RMZ line (re-entry). */
  line?: WmsReturnLineRead | null;
  disabled?: boolean;
  onSaved?: () => void;
};

type RowState = {
  snapshotId: number;
  label: string;
  soldQty: number;
  maxReturnable: number;
  unitPrice: number;
  perBundle: number;
  checked: boolean;
  returnedQty: number;
  acceptedQty: number;
  lots: Array<{ lot_number: string; picked_qty?: number }>;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function BundleReturnLinePanel({
  tenantId,
  warehouseId,
  returnId,
  rmzLineId,
  orderId,
  orderLineId,
  bundleName,
  initialComponents,
  line,
  disabled = false,
  onSaved,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [treeNode, setTreeNode] = useState<WmsReturnBundleTreeNodeRead | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [saving, setSaving] = useState(false);

  const physical = Math.max(
    0,
    Math.floor(Number(line?.quantity ?? treeNode?.physical_bundle_qty ?? treeNode?.bundle_qty ?? 1) || 1),
  );
  const canDisassemble = Boolean(treeNode?.can_stock_disassemble && treeNode.is_stock_sku);

  const [intakeMode, setIntakeMode] = useState<StockIntakeMode>("FG");
  const [fgQty, setFgQty] = useState(0);
  const [disassemblyQty, setDisassemblyQty] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tree = await getOrderBundleReturnTree(orderId, tenantId, warehouseId);
        if (cancelled) return;
        const node = tree.find((n) => n.order_line_id === orderLineId) ?? null;
        setTreeNode(node);
        if (!node) return;

        const phys = Math.max(1, Math.floor(Number(line?.quantity ?? node.physical_bundle_qty ?? node.bundle_qty) || 1));
        const savedMode = (line?.stock_intake_mode as StockIntakeMode | null | undefined) ?? null;
        const savedFg = line?.fg_intake_qty != null ? Math.max(0, Math.floor(Number(line.fg_intake_qty))) : null;
        const savedDq = line?.disassembly_qty != null ? Math.max(0, Math.floor(Number(line.disassembly_qty))) : null;

        let mode: StockIntakeMode = "FG";
        let fg = phys;
        let dq = 0;
        if (node.can_stock_disassemble && node.is_stock_sku) {
          if (savedMode === "DISASSEMBLE" || savedMode === "MIXED" || (savedDq != null && savedDq > 0)) {
            mode = savedFg != null && savedFg > 0 && (savedDq ?? 0) > 0 ? "MIXED" : "DISASSEMBLE";
            fg = savedFg ?? 0;
            dq = savedDq ?? (mode === "DISASSEMBLE" ? phys : 0);
          } else {
            mode = "FG";
            fg = savedFg != null ? savedFg : phys;
            dq = 0;
          }
        }
        if (fg + dq > phys) {
          dq = Math.max(0, phys - fg);
        }
        setIntakeMode(mode);
        setFgQty(fg);
        setDisassemblyQty(dq);

        const useSnapshot = mode !== "FG" && (node.snapshot_components?.length ?? 0) > 0;
        const source = useSnapshot ? node.snapshot_components : node.components;
        const savedBySnap = new Map((initialComponents ?? []).map((c) => [c.snapshot_id, c]));
        setRows(
          (source ?? []).map((c) => {
            const per = Math.max(0, Math.floor(Number(c.quantity_per_bundle ?? 0) || 0));
            const expected =
              useSnapshot && dq > 0 && per > 0
                ? per * dq
                : Math.max(0, Math.floor(Number(c.sold_qty) || 0));
            const saved = savedBySnap.get(c.snapshot_id);
            const returned = useSnapshot ? expected : (saved?.returned_qty ?? 0);
            const accepted = saved?.accepted_qty ?? (useSnapshot ? expected : returned);
            return {
              snapshotId: c.snapshot_id,
              label: c.component_name,
              soldQty: c.sold_qty,
              maxReturnable: useSnapshot ? expected : c.max_returnable_qty,
              unitPrice: c.unit_price_snapshot,
              perBundle: per || (phys > 0 ? Math.round(c.sold_qty / phys) : 0),
              checked: useSnapshot || returned > 0,
              returnedQty: returned,
              acceptedQty: Math.min(accepted, returned || expected),
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
  }, [orderId, orderLineId, tenantId, warehouseId, initialComponents, line]);

  const rebuildDisassembleRows = useCallback(
    (dq: number, prevRows: RowState[]) => {
      if (!treeNode?.snapshot_components?.length) return prevRows;
      const bySnap = new Map(prevRows.map((r) => [r.snapshotId, r]));
      return treeNode.snapshot_components.map((c) => {
        const per = Math.max(
          0,
          Math.floor(Number(c.quantity_per_bundle ?? 0) || 0) ||
            (physical > 0 ? Math.round(c.sold_qty / physical) : 0),
        );
        const expected = Math.max(0, per * dq);
        const prev = bySnap.get(c.snapshot_id);
        const accepted = prev != null ? clamp(prev.acceptedQty, 0, expected) : expected;
        return {
          snapshotId: c.snapshot_id,
          label: c.component_name,
          soldQty: c.sold_qty,
          maxReturnable: expected,
          unitPrice: c.unit_price_snapshot,
          perBundle: per,
          checked: expected > 0,
          returnedQty: expected,
          acceptedQty: accepted,
          lots: c.lots ?? [],
        };
      });
    },
    [treeNode, physical],
  );

  const setMode = useCallback(
    (next: StockIntakeMode) => {
      setIntakeMode(next);
      if (next === "FG") {
        setFgQty(physical);
        setDisassemblyQty(0);
        if (treeNode) {
          setRows(
            treeNode.components.map((c) => ({
              snapshotId: c.snapshot_id,
              label: c.component_name,
              soldQty: c.sold_qty,
              maxReturnable: c.max_returnable_qty,
              unitPrice: c.unit_price_snapshot,
              perBundle: 0,
              checked: false,
              returnedQty: 0,
              acceptedQty: 0,
              lots: c.lots ?? [],
            })),
          );
        }
        return;
      }
      if (next === "DISASSEMBLE") {
        setFgQty(0);
        const dq = physical > 0 ? physical : 1;
        setDisassemblyQty(dq);
        setRows((prev) => rebuildDisassembleRows(dq, prev));
        return;
      }
      // MIXED
      const fg = Math.min(1, physical);
      const dq = Math.max(0, physical - fg);
      setFgQty(fg);
      setDisassemblyQty(dq);
      setRows((prev) => rebuildDisassembleRows(dq, prev));
    },
    [physical, treeNode, rebuildDisassembleRows],
  );

  const onFgChange = useCallback(
    (v: number) => {
      const fg = clamp(v, 0, physical);
      const dq = clamp(disassemblyQty, 0, physical - fg);
      setFgQty(fg);
      setDisassemblyQty(dq);
      if (fg > 0 && dq > 0) setIntakeMode("MIXED");
      else if (dq > 0) setIntakeMode("DISASSEMBLE");
      else setIntakeMode("FG");
      if (dq > 0) setRows((prev) => rebuildDisassembleRows(dq, prev));
    },
    [physical, disassemblyQty, rebuildDisassembleRows],
  );

  const onDqChange = useCallback(
    (v: number) => {
      const dq = clamp(v, 0, physical);
      const fg = clamp(fgQty, 0, physical - dq);
      setDisassemblyQty(dq);
      setFgQty(fg);
      if (fg > 0 && dq > 0) setIntakeMode("MIXED");
      else if (dq > 0) setIntakeMode("DISASSEMBLE");
      else setIntakeMode("FG");
      if (dq > 0) setRows((prev) => rebuildDisassembleRows(dq, prev));
      else if (treeNode) {
        setRows(
          treeNode.components.map((c) => ({
            snapshotId: c.snapshot_id,
            label: c.component_name,
            soldQty: c.sold_qty,
            maxReturnable: c.max_returnable_qty,
            unitPrice: c.unit_price_snapshot,
            perBundle: 0,
            checked: false,
            returnedQty: 0,
            acceptedQty: 0,
            lots: c.lots ?? [],
          })),
        );
      }
    },
    [physical, fgQty, rebuildDisassembleRows, treeNode],
  );

  const refundPreview = useMemo(() => {
    if (intakeMode === "FG") {
      const unit = treeNode?.unit_price_net ?? 0;
      return unit * fgQty;
    }
    return rows.reduce((sum, r) => {
      if (r.acceptedQty <= 0) return sum;
      return sum + r.unitPrice * r.acceptedQty;
    }, 0);
  }, [intakeMode, fgQty, rows, treeNode]);

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
        return { ...r, acceptedQty: Math.min(v, r.returnedQty || cap), checked: r.returnedQty > 0 || v > 0 };
      }),
    );
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const stockMode: StockIntakeMode =
        fgQty > 0 && disassemblyQty > 0 ? "MIXED" : disassemblyQty > 0 ? "DISASSEMBLE" : "FG";
      const components: WmsReturnBundleComponentIn[] =
        stockMode === "FG"
          ? []
          : rows
              .filter((r) => r.returnedQty > 0 || r.maxReturnable > 0)
              .map((r) => ({
                snapshot_id: r.snapshotId,
                returned_qty: r.returnedQty > 0 ? r.returnedQty : r.maxReturnable,
                accepted_qty: r.acceptedQty,
                decision: r.acceptedQty < (r.returnedQty || r.maxReturnable) ? "PARTIAL" : "OK",
              }));
      await updateWmsReturnBundleComponents(
        returnId,
        rmzLineId,
        tenantId,
        {
          components,
          stock_intake_mode: canDisassemble ? stockMode : undefined,
          fg_intake_qty: canDisassemble ? fgQty : undefined,
          disassembly_qty: canDisassemble ? disassemblyQty : undefined,
        },
        warehouseId,
      );
      toast.success("Zapisano składniki zestawu");
      onSaved?.();
    } catch {
      toast.error("Nie udało się zapisać składników zestawu");
    } finally {
      setSaving(false);
    }
  }, [
    rows,
    returnId,
    rmzLineId,
    tenantId,
    warehouseId,
    onSaved,
    canDisassemble,
    fgQty,
    disassemblyQty,
  ]);

  if (!treeNode || (treeNode.components.length === 0 && !treeNode.can_stock_disassemble)) return null;

  const title = bundleName || treeNode.bundle_name || "Zestaw";
  const showDisassembleUi = canDisassemble && intakeMode !== "FG";

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
          {canDisassemble ? (
            <div className="rounded-lg border border-violet-100 bg-white px-2 py-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-violet-900">
                Przyjęcie magazynowe
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                    intakeMode === "FG"
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                  onClick={() => setMode("FG")}
                >
                  Przyjmij jako zestaw gotowy
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                    intakeMode !== "FG"
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                  onClick={() => setMode("DISASSEMBLE")}
                >
                  Rozmontuj na składniki
                </button>
              </div>
              {intakeMode !== "FG" ? (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-700">
                  <label className="flex items-center gap-1">
                    Gotowy SKU
                    <input
                      type="number"
                      min={0}
                      max={physical}
                      className="w-14 rounded border border-slate-200 px-1 py-0.5 tabular-nums"
                      value={fgQty}
                      disabled={disabled}
                      onChange={(e) => onFgChange(Number(e.target.value))}
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    Rozmontuj
                    <input
                      type="number"
                      min={0}
                      max={physical}
                      className="w-14 rounded border border-slate-200 px-1 py-0.5 tabular-nums"
                      value={disassemblyQty}
                      disabled={disabled}
                      onChange={(e) => onDqChange(Number(e.target.value))}
                    />
                  </label>
                  <span className="text-slate-500">/ {physical} zwrot</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {showDisassembleUi
            ? rows.map((r) => {
                const scrap = Math.max(0, r.returnedQty - r.acceptedQty);
                return (
                  <div
                    key={r.snapshotId}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-100 bg-white px-2 py-2 text-sm"
                  >
                    <span className="min-w-[8rem] flex-1 font-medium text-slate-900">
                      {r.label}{" "}
                      <span className="text-xs font-normal text-slate-500">
                        expected {r.returnedQty}
                        {r.perBundle > 0 ? ` (${r.perBundle}×${disassemblyQty})` : ""}
                      </span>
                    </span>
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
                    <span className="text-xs tabular-nums text-slate-500">scrap {scrap}</span>
                  </div>
                );
              })
            : rows.map((r) => (
                <label
                  key={r.snapshotId || `stock-${r.label}`}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-100 bg-white px-2 py-2 text-sm"
                >
                  {!canDisassemble ? (
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-violet-300"
                      checked={r.checked}
                      disabled={disabled || r.maxReturnable <= 0}
                      onChange={(e) => toggleRow(r.snapshotId, e.target.checked)}
                    />
                  ) : null}
                  <span className="min-w-[8rem] flex-1 font-medium text-slate-900">
                    {r.label} ×{r.soldQty}
                  </span>
                  {r.lots.length > 0 ? (
                    <span className="w-full basis-full text-[11px] font-semibold text-violet-800 pl-6">
                      Partia: {r.lots.map((l) => l.lot_number).filter(Boolean).join(", ")}
                    </span>
                  ) : null}
                  <span className="text-xs tabular-nums text-slate-500">{r.unitPrice.toFixed(2)} zł/szt.</span>
                  {!canDisassemble && r.checked ? (
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
            <PrimaryButton type="button" disabled={disabled || saving} onClick={() => void save()}>
              {saving ? "Zapis…" : "Zapisz składniki"}
            </PrimaryButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
