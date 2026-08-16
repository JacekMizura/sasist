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
import { ReturnStockIntakeSection } from "./intake/ReturnStockIntakeSection";
import type { IntakeComponentRow } from "./intake/IntakeComponentRows";
import {
  BUNDLE_INTAKE_COPY,
  clampInt,
  resolveStockIntakeMode,
  splitReturnedQty,
  type StockIntakeTileId,
} from "./intake/stockIntakeMode";

type Props = {
  tenantId: number;
  warehouseId: number;
  returnId: number;
  rmzLineId: number;
  orderId: number;
  orderLineId: number;
  bundleName?: string | null;
  initialComponents?: WmsReturnBundleComponentRead[];
  line?: WmsReturnLineRead | null;
  disabled?: boolean;
  onSaved?: () => void;
};

type RowState = {
  snapshotId: number;
  label: string;
  sku: string | null;
  soldQty: number;
  maxReturnable: number;
  unitPrice: number;
  perBundle: number;
  checked: boolean;
  returnedQty: number;
  acceptedQty: number;
  lots: Array<{ lot_number: string; picked_qty?: number }>;
};

function bundleManyLabel(n: number): string {
  if (n === 1) return "1 zestawu";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} zestawów`;
  return `${n} zestawów`;
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

        const phys = Math.max(
          1,
          Math.floor(Number(line?.quantity ?? node.physical_bundle_qty ?? node.bundle_qty) || 1),
        );
        const savedMode = (line?.stock_intake_mode as StockIntakeMode | null | undefined) ?? null;
        const savedFg = line?.fg_intake_qty != null ? Math.max(0, Math.floor(Number(line.fg_intake_qty))) : null;
        const savedDq = line?.disassembly_qty != null ? Math.max(0, Math.floor(Number(line.disassembly_qty))) : null;

        let mode: StockIntakeMode = "FG";
        let fg = phys;
        let dq = 0;
        if (node.can_stock_disassemble && node.is_stock_sku) {
          if (savedMode === "DISASSEMBLE" || savedMode === "MIXED" || (savedDq != null && savedDq > 0)) {
            mode =
              savedFg != null && savedFg > 0 && (savedDq ?? 0) > 0
                ? "MIXED"
                : savedMode === "MIXED"
                  ? "MIXED"
                  : "DISASSEMBLE";
            fg = savedFg ?? (mode === "MIXED" ? Math.min(1, phys) : 0);
            dq = savedDq ?? (mode === "DISASSEMBLE" ? phys : Math.max(0, phys - fg));
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
              sku: c.sku?.trim() || null,
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
        const accepted = prev != null ? clampInt(prev.acceptedQty, 0, expected) : expected;
        return {
          snapshotId: c.snapshot_id,
          label: c.component_name,
          sku: c.sku?.trim() || null,
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

  const applyFgDq = useCallback(
    (fg: number, dq: number) => {
      const fgN = clampInt(fg, 0, physical);
      const dqN = clampInt(dq, 0, physical - fgN);
      setFgQty(fgN);
      setDisassemblyQty(dqN);
      setIntakeMode(resolveStockIntakeMode(fgN, dqN) ?? "FG");
      if (dqN > 0) setRows((prev) => rebuildDisassembleRows(dqN, prev));
      else if (treeNode) {
        setRows(
          treeNode.components.map((c) => ({
            snapshotId: c.snapshot_id,
            label: c.component_name,
            sku: c.sku?.trim() || null,
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
    [physical, rebuildDisassembleRows, treeNode],
  );

  const onSelectTile = useCallback(
    (tile: StockIntakeTileId) => {
      if (disabled || !canDisassemble) return;
      if (physical <= 1 && tile === "MIXED") {
        applyFgDq(0, physical);
        return;
      }
      const next = splitReturnedQty(physical, tile, tile === "MIXED" ? Math.min(1, physical) : undefined);
      applyFgDq(next.fg, next.dq);
    },
    [disabled, canDisassemble, physical, applyFgDq],
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

  const componentRows: IntakeComponentRow[] = showDisassembleUi
    ? rows.map((r) => ({
        key: r.snapshotId,
        name: r.label,
        sku: r.sku,
        perUnit: r.perBundle,
        expected: r.returnedQty || r.maxReturnable,
        accepted: r.acceptedQty,
        scrap: Math.max(0, (r.returnedQty || r.maxReturnable) - r.acceptedQty),
      }))
    : [];

  const saveFooter = (
    <div className="flex items-center justify-between gap-3 pt-0.5">
      <span className="text-[11px] font-semibold tabular-nums text-slate-600">
        Refund (snapshot): {refundPreview.toFixed(2)} zł
      </span>
      <PrimaryButton type="button" disabled={disabled || saving} onClick={() => void save()}>
        {saving ? "Zapis…" : "Zapisz składniki"}
      </PrimaryButton>
    </div>
  );

  if (!canDisassemble) {
    return (
      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-600">Zestaw bez rozmontowania magazynowego — zwrot elementów opcjonalny.</p>
          {rows.map((r) => (
            <label
              key={r.snapshotId || `stock-${r.label}`}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 px-2 py-2 text-sm"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={r.checked}
                disabled={disabled || r.maxReturnable <= 0}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setRows((prev) =>
                    prev.map((row) => {
                      if (row.snapshotId !== r.snapshotId) return row;
                      const qty = checked ? Math.min(1, row.maxReturnable) || row.soldQty : 0;
                      return {
                        ...row,
                        checked,
                        returnedQty: checked ? (row.returnedQty > 0 ? row.returnedQty : qty) : 0,
                        acceptedQty: checked ? (row.acceptedQty > 0 ? row.acceptedQty : qty) : 0,
                      };
                    }),
                  );
                }}
              />
              <span className="min-w-[8rem] flex-1 font-medium text-slate-900">
                {r.label} ×{r.soldQty}
              </span>
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
          <div className="flex justify-end">
            <PrimaryButton type="button" disabled={disabled || saving} onClick={() => void save()}>
              {saving ? "Zapis…" : "Zapisz składniki"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ReturnStockIntakeSection
        copy={BUNDLE_INTAKE_COPY}
        physicalQty={physical}
        mode={intakeMode}
        fgQty={fgQty}
        disassemblyQty={disassemblyQty}
        components={componentRows}
        manyQtyLabel={bundleManyLabel(Math.max(disassemblyQty, 1))}
        disabled={disabled}
        overLimit={fgQty + disassemblyQty > physical}
        underLimit={fgQty + disassemblyQty < physical && fgQty + disassemblyQty > 0}
        footer={saveFooter}
        onSelectMode={onSelectTile}
        onMixedFgChange={(fg) => applyFgDq(fg, Math.max(0, physical - clampInt(fg, 0, physical)))}
        onMixedDqChange={(dq) => {
          const dqN = clampInt(dq, 0, physical);
          applyFgDq(Math.max(0, physical - dqN), dqN);
        }}
        onAcceptedChange={(key, accepted) => setQty(Number(key), "acceptedQty", accepted)}
      />
    </div>
  );
}
