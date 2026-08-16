import type {
  ManufacturedComponentRecoveryMode,
  StockIntakeMode,
  WmsBomPreviewRead,
  WmsReturnComponentRecoveryIn,
  WmsReturnComponentRecoveryRead,
  WmsReturnLineRead,
} from "../../types/wmsReturn";
import { DisassemblyPreviewTable } from "./intake/DisassemblyPreviewTable";
import { IntakeStructureInfoPanel } from "./intake/IntakeStructureInfoPanel";
import { StockIntakeModeTiles } from "./intake/StockIntakeModeTiles";
import {
  MANUFACTURED_INTAKE_COPY,
  clampInt,
  resolveStockIntakeMode,
  splitReturnedQty,
  type StockIntakeTileId,
} from "./intake/stockIntakeMode";

export type ManufacturedRecoveryDraft = {
  stock_intake_mode: StockIntakeMode | null;
  fg_intake_qty: number;
  disassembly_qty: number;
  component_recoveries: WmsReturnComponentRecoveryIn[];
};

type Props = {
  line: WmsReturnLineRead;
  mode: ManufacturedComponentRecoveryMode;
  value: ManufacturedRecoveryDraft;
  onChange: (next: ManufacturedRecoveryDraft) => void;
  disabled?: boolean;
};

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

export function draftFromLine(
  line: WmsReturnLineRead,
  mode: ManufacturedComponentRecoveryMode,
): ManufacturedRecoveryDraft {
  const physical = Math.max(0, Math.floor(Number(line.quantity) || 0));
  const required = mode === "REQUIRED";
  const locked = Boolean(line.manufactured_recovery_locked_reason);
  let fg = line.fg_intake_qty != null ? Math.max(0, Math.floor(Number(line.fg_intake_qty))) : required ? 0 : physical;
  let dq =
    line.disassembly_qty != null
      ? Math.max(0, Math.floor(Number(line.disassembly_qty)))
      : required
        ? physical
        : 0;
  if (required) {
    fg = 0;
    if (dq < 1 && !locked) dq = physical;
  }
  if (fg + dq > physical) {
    dq = Math.max(0, physical - fg);
  }
  let intake: StockIntakeMode | null = line.stock_intake_mode ?? null;
  if (!intake) {
    intake = resolveStockIntakeMode(fg, dq);
  }
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
    component_recoveries: recoveries.length > 0 ? recoveries : scaleMatrix(line.bom_preview, dq, []),
  };
}

function emit(
  line: WmsReturnLineRead,
  value: ManufacturedRecoveryDraft,
  fg: number,
  dq: number,
  onChange: (next: ManufacturedRecoveryDraft) => void,
) {
  const recoveries = scaleMatrix(line.bom_preview, dq, value.component_recoveries);
  onChange({
    stock_intake_mode: resolveStockIntakeMode(fg, dq),
    fg_intake_qty: fg,
    disassembly_qty: dq,
    component_recoveries: recoveries,
  });
}

export function ManufacturedRecoveryIntakePanel({ line, mode, value, onChange, disabled }: Props) {
  if (!line.manufactured_recovery_eligible || mode === "OFF") return null;

  const physical = Math.max(0, Math.floor(Number(line.quantity) || 0));
  const required = mode === "REQUIRED";
  const lockedReason = line.manufactured_recovery_locked_reason?.trim() || null;
  const locked = Boolean(lockedReason);
  const fg = required ? 0 : value.fg_intake_qty;
  const dq = value.disassembly_qty;
  const sum = fg + dq;
  const over = sum > physical;
  const under = sum < physical && sum > 0;
  const activeMode = value.stock_intake_mode ?? resolveStockIntakeMode(fg, dq);

  const applyTile = (tile: StockIntakeTileId) => {
    if (disabled || locked) return;
    if (required && tile === "FG") return;
    const next = splitReturnedQty(physical, required ? "DISASSEMBLE" : tile, tile === "MIXED" ? Math.min(1, physical) : undefined);
    emit(line, value, next.fg, next.dq, onChange);
  };

  const setMixedFg = (nextFg: number) => {
    if (disabled || locked || required) return;
    const fgN = clampInt(nextFg, 0, physical);
    emit(line, value, fgN, Math.max(0, physical - fgN), onChange);
  };

  const setMixedDq = (nextDq: number) => {
    if (disabled || locked) return;
    const dqN = clampInt(nextDq, required ? 1 : 0, physical);
    const fgN = required ? 0 : Math.max(0, physical - dqN);
    emit(line, value, fgN, dqN, onChange);
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
  const previewRows = comps.map((c) => {
    const per =
      Number(c.quantity_per_unit ?? 0) ||
      Number(c.expected_qty ?? 0) / Math.max(1, Number(line.bom_preview?.disassembly_qty ?? 1));
    const fromMany = per * Math.max(dq, 1);
    const recovery = value.component_recoveries.find((r) => r.composition_line_id === c.composition_line_id);
    const expected = Number(recovery?.expected_qty ?? fromMany);
    const accepted = Number(recovery?.accepted_qty ?? expected);
    const scrap = Number(recovery?.scrap_qty ?? Math.max(0, expected - accepted));
    const name = c.component_name?.trim() || `Komponent #${c.component_product_id}`;
    return {
      key: c.composition_line_id,
      name,
      sku: c.component_sku?.trim() || null,
      ratioLabel: `${per} szt.`,
      perOneLabel: `${per} szt.`,
      perManyLabel: `${fromMany} szt.`,
      availableLabel: "—",
      detail:
        dq > 0 ? (
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-700">
            <span>
              Do odzysku: <span className="font-semibold tabular-nums">{expected}</span> szt.
            </span>
            <label className="inline-flex items-center gap-1.5">
              Przyjmij na stan
              <input
                type="number"
                min={0}
                max={expected}
                step={1}
                className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-right tabular-nums"
                value={accepted}
                disabled={disabled || locked}
                onChange={(e) => setAccepted(c.composition_line_id, Number(e.target.value))}
              />
            </label>
            <span className="tabular-nums text-slate-600">
              Odrzut: <span className="font-semibold">{scrap}</span>
            </span>
          </div>
        ) : undefined,
    };
  });

  const structureChildren = comps.map(
    (c) => c.component_name?.trim() || c.component_sku?.trim() || `#${c.component_product_id}`,
  );

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      {lockedReason ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-950">
          {lockedReason}
        </p>
      ) : null}
      {required ? (
        <p className="text-[11px] font-medium text-slate-600">Wymagane rozmontowanie produktu.</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-3">
          <StockIntakeModeTiles
            copy={MANUFACTURED_INTAKE_COPY}
            physicalQty={physical}
            mode={activeMode}
            fgQty={fg}
            disassemblyQty={dq}
            disabled={disabled || locked}
            forceDisassemble={required}
            onSelectTile={applyTile}
            onMixedFgChange={setMixedFg}
            onMixedDqChange={setMixedDq}
          />
          {over ? (
            <p className="text-[11px] font-medium text-rose-700">
              Suma gotowego wyrobu i rozmontowania nie może przekroczyć ilości zwróconej ({physical} szt.).
            </p>
          ) : null}
          {under ? (
            <p className="text-[11px] font-medium text-amber-800">
              Gotowy wyrób + rozmontowanie powinny sumować się do ilości zwróconej ({physical} szt.).
            </p>
          ) : null}
          {dq > 0 ? (
            <DisassemblyPreviewTable
              title={MANUFACTURED_INTAKE_COPY.previewTitle}
              headers={MANUFACTURED_INTAKE_COPY.tableHeaders}
              manyQty={dq}
              rows={previewRows}
            />
          ) : null}
        </div>
        <IntakeStructureInfoPanel
          title={MANUFACTURED_INTAKE_COPY.sideTitle}
          rootLabel="Gotowy produkt"
          childLabels={structureChildren}
          lead={MANUFACTURED_INTAKE_COPY.sideLead}
          body={MANUFACTURED_INTAKE_COPY.sideBody}
        />
      </div>
    </div>
  );
}
