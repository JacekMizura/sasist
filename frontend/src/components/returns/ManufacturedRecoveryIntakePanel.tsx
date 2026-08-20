import type {
  ManufacturedComponentRecoveryMode,
  StockIntakeMode,
  WmsBomPreviewRead,
  WmsReturnComponentRecoveryIn,
  WmsReturnComponentRecoveryRead,
  WmsReturnIntakeDisposition,
  WmsReturnLineRead,
} from "../../types/wmsReturn";
import { ReturnStockIntakeSection } from "./intake/ReturnStockIntakeSection";
import type { IntakeComponentRow } from "./intake/IntakeComponentRows";
import {
  MANUFACTURED_INTAKE_COPY,
  clampInt,
  resolveStockIntakeMode,
  type StockIntakeTileId,
} from "./intake/stockIntakeMode";

export type IntakeDispositionCode = "SALEABLE" | "OUTLET_B" | "SERVICE_C";

export type ManufacturedRecoveryDraft = {
  stock_intake_mode: StockIntakeMode | null;
  fg_intake_qty: number;
  disassembly_qty: number;
  intake_disposition: WmsReturnIntakeDisposition[];
  component_recoveries: WmsReturnComponentRecoveryIn[];
};

const BUCKET_LABEL: Record<IntakeDispositionCode, string> = {
  SALEABLE: "OK (A)",
  OUTLET_B: "Uszkodzone B",
  SERVICE_C: "Uszkodzone C",
};

function emptyAllocation(): WmsReturnIntakeDisposition[] {
  return [
    { disposition: "SALEABLE", fg_qty: 0, disassembly_qty: 0 },
    { disposition: "OUTLET_B", fg_qty: 0, disassembly_qty: 0 },
    { disposition: "SERVICE_C", fg_qty: 0, disassembly_qty: 0 },
  ];
}

function commercialBuckets(line: WmsReturnLineRead): Record<IntakeDispositionCode, number> {
  return {
    SALEABLE: Math.max(0, Math.floor(Number(line.accepted_qty) || 0)),
    OUTLET_B: Math.max(0, Math.floor(Number(line.damaged_b_qty) || 0)),
    SERVICE_C: Math.max(0, Math.floor(Number(line.damaged_c_qty) || 0)),
  };
}

function projectAggregates(rows: WmsReturnIntakeDisposition[]): {
  fg: number;
  dq: number;
  mode: StockIntakeMode | null;
} {
  const fg = rows.reduce((s, r) => s + Math.max(0, Number(r.fg_qty) || 0), 0);
  const dq = rows.reduce((s, r) => s + Math.max(0, Number(r.disassembly_qty) || 0), 0);
  return { fg, dq, mode: resolveStockIntakeMode(fg, dq) };
}

function scaleMatrix(
  preview: WmsBomPreviewRead | null | undefined,
  disassemblyQty: number,
  existing: WmsReturnComponentRecoveryIn[],
): WmsReturnComponentRecoveryIn[] {
  const comps = preview?.components ?? [];
  if (comps.length < 1 || disassemblyQty < 1) return [];
  const byLine = new Map(existing.map((r) => [r.composition_line_id, r]));
  return comps.map((c) => {
    const per =
      Number(c.quantity_per_unit ?? 0) ||
      Number(c.expected_qty ?? 0) / Math.max(1, Number(preview?.disassembly_qty ?? 1));
    const expected = per * disassemblyQty;
    const prev = byLine.get(c.composition_line_id);
    const accepted = prev != null ? Number(prev.accepted_qty) : expected;
    const scrap = Math.max(0, expected - accepted);
    return {
      composition_line_id: c.composition_line_id,
      component_product_id: c.component_product_id,
      accepted_qty: clampInt(accepted, 0, expected),
      scrap_qty: scrap,
      expected_qty: expected,
    };
  });
}

function allocationFromCommercial(
  buckets: Record<IntakeDispositionCode, number>,
  mode: ManufacturedComponentRecoveryMode,
  existing?: WmsReturnIntakeDisposition[] | null,
): WmsReturnIntakeDisposition[] {
  const required = mode === "REQUIRED";
  const byDisp = new Map((existing ?? []).map((r) => [r.disposition, r]));
  return (["SALEABLE", "OUTLET_B", "SERVICE_C"] as IntakeDispositionCode[]).map((d) => {
    const qty = buckets[d];
    const prev = byDisp.get(d);
    if (required) {
      return { disposition: d, fg_qty: 0, disassembly_qty: qty };
    }
    if (prev && Number(prev.fg_qty) + Number(prev.disassembly_qty) === qty) {
      return {
        disposition: d,
        fg_qty: Math.max(0, Math.floor(Number(prev.fg_qty) || 0)),
        disassembly_qty: Math.max(0, Math.floor(Number(prev.disassembly_qty) || 0)),
      };
    }
    // OPTIONAL default: keep as FG
    return { disposition: d, fg_qty: qty, disassembly_qty: 0 };
  });
}

export function draftFromLine(
  line: WmsReturnLineRead,
  mode: ManufacturedComponentRecoveryMode,
): ManufacturedRecoveryDraft {
  const buckets = commercialBuckets(line);
  const rows = allocationFromCommercial(buckets, mode, line.intake_disposition ?? null);
  const { fg, dq, mode: intake } = projectAggregates(rows);
  const recoveries: WmsReturnComponentRecoveryIn[] = (line.component_recoveries ?? []).map(
    (r: WmsReturnComponentRecoveryRead) => ({
      composition_line_id: r.composition_line_id,
      component_product_id: r.component_product_id,
      accepted_qty: Number(r.accepted_qty ?? 0),
      scrap_qty: Number(r.scrap_qty ?? 0),
      expected_qty: Number(r.expected_qty ?? 0),
    }),
  );
  return {
    stock_intake_mode: intake,
    fg_intake_qty: fg,
    disassembly_qty: dq,
    intake_disposition: rows,
    component_recoveries: recoveries.length > 0 ? recoveries : scaleMatrix(line.bom_preview, dq, []),
  };
}

type Props = {
  line: WmsReturnLineRead;
  mode: ManufacturedComponentRecoveryMode;
  value: ManufacturedRecoveryDraft;
  onChange: (next: ManufacturedRecoveryDraft) => void;
  disabled?: boolean;
};

function emit(
  line: WmsReturnLineRead,
  value: ManufacturedRecoveryDraft,
  rows: WmsReturnIntakeDisposition[],
  onChange: (next: ManufacturedRecoveryDraft) => void,
) {
  const { fg, dq, mode } = projectAggregates(rows);
  onChange({
    stock_intake_mode: mode,
    fg_intake_qty: fg,
    disassembly_qty: dq,
    intake_disposition: rows,
    component_recoveries: scaleMatrix(line.bom_preview, dq, value.component_recoveries),
  });
}

export function ManufacturedRecoveryIntakePanel({ line, mode, value, onChange, disabled }: Props) {
  if (!line.manufactured_recovery_eligible || mode === "OFF") return null;

  const buckets = commercialBuckets(line);
  const receivable =
    buckets.SALEABLE + buckets.OUTLET_B + buckets.SERVICE_C;
  if (receivable <= 0) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Brak ilości do przyjęcia (wszystkie sztuki odrzucone) — odzysk komponentów nie dotyczy.
      </div>
    );
  }

  const required = mode === "REQUIRED";
  const lockedReason = line.manufactured_recovery_locked_reason?.trim() || null;
  const locked = Boolean(lockedReason);
  const rows = value.intake_disposition?.length
    ? value.intake_disposition
    : allocationFromCommercial(buckets, mode, null);
  const { fg, dq, mode: activeMode } = projectAggregates(rows);
  const activeBuckets = (["SALEABLE", "OUTLET_B", "SERVICE_C"] as IntakeDispositionCode[]).filter(
    (d) => buckets[d] > 0,
  );

  const setBucketDq = (disposition: IntakeDispositionCode, nextDq: number) => {
    if (disabled || locked || required) return;
    const qty = buckets[disposition];
    const dqN = clampInt(nextDq, 0, qty);
    const next = rows.map((r) =>
      r.disposition === disposition
        ? { ...r, disassembly_qty: dqN, fg_qty: Math.max(0, qty - dqN) }
        : r,
    );
    emit(line, value, next, onChange);
  };

  const applyGlobalTile = (tile: StockIntakeTileId) => {
    if (disabled || locked) return;
    if (required && tile === "FG") return;
    const next = emptyAllocation().map((r) => {
      const qty = buckets[r.disposition as IntakeDispositionCode] ?? 0;
      if (qty <= 0) return r;
      if (required || tile === "DISASSEMBLE") {
        return { ...r, fg_qty: 0, disassembly_qty: qty };
      }
      if (tile === "FG") {
        return { ...r, fg_qty: qty, disassembly_qty: 0 };
      }
      // MIXED: split each non-zero bucket ~half (deterministic per bucket, not heuristic across buckets)
      const dqPart = qty <= 1 ? qty : Math.floor(qty / 2);
      return { ...r, fg_qty: qty - dqPart, disassembly_qty: dqPart };
    });
    emit(line, value, next, onChange);
  };

  const setAccepted = (compositionLineId: number, accepted: number) => {
    if (disabled || locked) return;
    onChange({
      ...value,
      component_recoveries: value.component_recoveries.map((r) => {
        if (r.composition_line_id !== compositionLineId) return r;
        const expected = Number(r.expected_qty ?? 0);
        const acc = clampInt(accepted, 0, expected);
        return { ...r, accepted_qty: acc, scrap_qty: Math.max(0, expected - acc) };
      }),
    });
  };

  const comps = line.bom_preview?.components ?? [];
  const componentRows: IntakeComponentRow[] = comps.map((c) => {
    const per =
      Number(c.quantity_per_unit ?? 0) ||
      Number(c.expected_qty ?? 0) / Math.max(1, Number(line.bom_preview?.disassembly_qty ?? 1));
    const fromMany = per * Math.max(dq, 1);
    const recovery = value.component_recoveries.find((r) => r.composition_line_id === c.composition_line_id);
    const expected = Number(recovery?.expected_qty ?? fromMany);
    const accepted = Number(recovery?.accepted_qty ?? expected);
    const scrap = Number(recovery?.scrap_qty ?? Math.max(0, expected - accepted));
    return {
      key: c.composition_line_id,
      name: c.component_name?.trim() || `Komponent #${c.component_product_id}`,
      sku: c.component_sku?.trim() || null,
      perUnit: per,
      expected,
      accepted,
      scrap,
    };
  });

  return (
    <div className="mt-3 space-y-3">
      <ReturnStockIntakeSection
        copy={{
          ...MANUFACTURED_INTAKE_COPY,
          sectionTitle: "Sposób przyjęcia (produkty produkowane)",
          badgeHint:
            "Rozliczenie FG vs rozmontowanie osobno dla OK / B / C. Odrzucone sztuki nie wchodzą do przyjęcia.",
        }}
        physicalQty={receivable}
        mode={activeMode}
        fgQty={fg}
        disassemblyQty={dq}
        components={componentRows}
        manyQtyLabel={`${Math.max(dq, 1)} szt.`}
        disabled={disabled || locked}
        forceDisassemble={required}
        lockedReason={lockedReason}
        requiredHint={required}
        overLimit={false}
        underLimit={false}
        onSelectMode={applyGlobalTile}
        onMixedFgChange={() => undefined}
        onMixedDqChange={() => undefined}
        onAcceptedChange={(key, accepted) => setAccepted(Number(key), accepted)}
      />
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-xs font-semibold text-slate-800">Alokacja per klasa jakości</p>
        {activeBuckets.map((d) => {
          const row = rows.find((r) => r.disposition === d) ?? {
            disposition: d,
            fg_qty: buckets[d],
            disassembly_qty: 0,
          };
          const qty = buckets[d];
          return (
            <div
              key={d}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2 py-2 text-xs"
            >
              <span className="min-w-[7rem] font-medium text-slate-800">{BUCKET_LABEL[d]}</span>
              <span className="tabular-nums text-slate-500">{qty} szt.</span>
              <label className="ml-auto flex items-center gap-1 text-slate-600">
                Rozmontuj
                <input
                  type="number"
                  min={0}
                  max={qty}
                  className="w-16 rounded border border-slate-200 px-1.5 py-0.5 tabular-nums"
                  value={row.disassembly_qty}
                  disabled={disabled || locked || required}
                  onChange={(e) => setBucketDq(d, Number(e.target.value))}
                />
              </label>
              <span className="tabular-nums text-slate-700">
                FG: <strong>{row.fg_qty}</strong>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
