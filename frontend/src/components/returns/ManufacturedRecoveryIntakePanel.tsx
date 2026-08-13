import type {
  ManufacturedComponentRecoveryMode,
  StockIntakeMode,
  WmsBomPreviewRead,
  WmsReturnComponentRecoveryIn,
  WmsReturnComponentRecoveryRead,
  WmsReturnLineRead,
} from "../../types/wmsReturn";

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

function stepperBtnClass(disabled?: boolean) {
  return `inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
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
    const per = Number(c.quantity_per_unit ?? 0) || Number(c.expected_qty ?? 0) / Math.max(1, Number(preview?.disassembly_qty ?? 1));
    const expected = per * disassemblyQty;
    const prev = byLine.get(c.composition_line_id);
    const accepted = prev != null ? Number(prev.accepted_qty) : expected;
    const scrap = Math.max(0, expected - accepted);
    return {
      composition_line_id: c.composition_line_id,
      component_product_id: c.component_product_id,
      accepted_qty: clamp(accepted, 0, expected),
      scrap_qty: scrap,
      expected_qty: expected,
    };
  });
}

export function draftFromLine(line: WmsReturnLineRead, mode: ManufacturedComponentRecoveryMode): ManufacturedRecoveryDraft {
  const physical = Math.max(0, Math.floor(Number(line.quantity) || 0));
  const required = mode === "REQUIRED";
  const locked = Boolean(line.manufactured_recovery_locked_reason);
  let fg = line.fg_intake_qty != null ? Math.max(0, Math.floor(Number(line.fg_intake_qty))) : required ? 0 : physical;
  let dq = line.disassembly_qty != null ? Math.max(0, Math.floor(Number(line.disassembly_qty))) : required ? physical : 0;
  if (required) {
    fg = 0;
    if (dq < 1 && !locked) dq = physical;
  }
  if (fg + dq > physical) {
    dq = Math.max(0, physical - fg);
  }
  let intake: StockIntakeMode | null = line.stock_intake_mode ?? null;
  if (!intake) {
    if (fg > 0 && dq > 0) intake = "MIXED";
    else if (dq > 0) intake = "DISASSEMBLE";
    else if (fg > 0) intake = "FG";
  }
  const recoveries: WmsReturnComponentRecoveryIn[] =
    (line.component_recoveries ?? []).map((r: WmsReturnComponentRecoveryRead) => ({
      composition_line_id: r.composition_line_id,
      component_product_id: r.component_product_id,
      accepted_qty: Number(r.accepted_qty ?? 0),
      scrap_qty: Number(r.scrap_qty ?? 0),
      expected_qty: Number(r.expected_qty ?? 0),
    }));
  return {
    stock_intake_mode: intake,
    fg_intake_qty: fg,
    disassembly_qty: dq,
    component_recoveries:
      recoveries.length > 0 ? recoveries : scaleMatrix(line.bom_preview, dq, []),
  };
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

  const setFg = (nextFg: number) => {
    if (disabled || locked || required) return;
    const fgN = clamp(Math.floor(nextFg), 0, physical);
    const dqN = clamp(dq, 0, physical - fgN);
    const recoveries = scaleMatrix(line.bom_preview, dqN, value.component_recoveries);
    let intake: StockIntakeMode | null = null;
    if (fgN > 0 && dqN > 0) intake = "MIXED";
    else if (dqN > 0) intake = "DISASSEMBLE";
    else if (fgN > 0) intake = "FG";
    onChange({
      stock_intake_mode: intake,
      fg_intake_qty: fgN,
      disassembly_qty: dqN,
      component_recoveries: recoveries,
    });
  };

  const setDq = (nextDq: number) => {
    if (disabled || locked) return;
    const maxDq = required ? physical : physical - fg;
    const dqN = clamp(Math.floor(nextDq), required ? 1 : 0, maxDq);
    const fgN = required ? 0 : fg;
    const recoveries = scaleMatrix(line.bom_preview, dqN, value.component_recoveries);
    let intake: StockIntakeMode | null = null;
    if (fgN > 0 && dqN > 0) intake = "MIXED";
    else if (dqN > 0) intake = "DISASSEMBLE";
    else if (fgN > 0) intake = "FG";
    onChange({
      stock_intake_mode: intake,
      fg_intake_qty: fgN,
      disassembly_qty: dqN,
      component_recoveries: recoveries,
    });
  };

  const setAccepted = (compositionLineId: number, accepted: number) => {
    if (disabled || locked) return;
    onChange({
      ...value,
      component_recoveries: value.component_recoveries.map((r) => {
        if (r.composition_line_id !== compositionLineId) return r;
        const expected = Number(r.expected_qty ?? 0);
        const acc = clamp(Math.floor(accepted), 0, expected);
        return { ...r, accepted_qty: acc, scrap_qty: Math.max(0, expected - acc) };
      }),
    });
  };

  const labelByLine = new Map(
    (line.bom_preview?.components ?? []).map((c) => [
      c.composition_line_id,
      {
        name: c.component_name?.trim() || `Komponent #${c.component_product_id}`,
        sku: c.component_sku?.trim() || null,
      },
    ]),
  );

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Przyjęcie magazynowe</p>
      <p className="mt-0.5 text-xs text-slate-600">
        Ilość zwrócona: <span className="font-semibold tabular-nums">{physical}</span>
        {required ? " · wymagane rozmontowanie" : null}
      </p>
      {lockedReason ? (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-950">
          {lockedReason}
        </p>
      ) : null}
      <div className="mt-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-700">Przyjmij jako gotowy produkt</span>
          <div className="flex items-center gap-1.5">
            <button type="button" className={stepperBtnClass(disabled || locked || required)} disabled={disabled || locked || required} onClick={() => setFg(fg - 1)}>
              −
            </button>
            <span className="min-w-[2rem] text-center text-sm font-bold tabular-nums text-slate-900">{fg}</span>
            <button type="button" className={stepperBtnClass(disabled || locked || required)} disabled={disabled || locked || required} onClick={() => setFg(fg + 1)}>
              +
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-700">Rozmontuj</span>
          <div className="flex items-center gap-1.5">
            <button type="button" className={stepperBtnClass(disabled || locked)} disabled={disabled || locked} onClick={() => setDq(dq - 1)}>
              −
            </button>
            <span className="min-w-[2rem] text-center text-sm font-bold tabular-nums text-slate-900">{dq}</span>
            <button type="button" className={stepperBtnClass(disabled || locked)} disabled={disabled || locked} onClick={() => setDq(dq + 1)}>
              +
            </button>
          </div>
        </div>
      </div>
      {over ? (
        <p className="mt-2 text-[11px] font-medium text-rose-700">
          Suma FG + rozmontowanie nie może przekroczyć ilości zwróconej.
        </p>
      ) : null}
      {dq > 0 ? (
        <div className="mt-3 space-y-2 border-t border-slate-200/80 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Komponenty</p>
          {value.component_recoveries.map((r) => {
            const expected = Number(r.expected_qty ?? 0);
            const accepted = Number(r.accepted_qty ?? 0);
            const scrap = Number(r.scrap_qty ?? 0);
            const meta = labelByLine.get(r.composition_line_id);
            const label = meta?.name ?? `Komponent #${r.component_product_id}`;
            const sku = meta?.sku ?? null;
            return (
              <div key={r.composition_line_id} className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
                <div className="text-xs font-semibold text-slate-800">{label}</div>
                {sku ? <div className="mt-0.5 font-mono text-[11px] text-slate-500">{sku}</div> : null}
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Do odzysku: <span className="font-semibold tabular-nums text-slate-700">{expected}</span> szt.
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px]">
                  <label className="inline-flex items-center gap-1.5 text-slate-700">
                    Przyjmij na stan
                    <input
                      type="number"
                      min={0}
                      max={expected}
                      step={1}
                      className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-right tabular-nums"
                      value={accepted}
                      disabled={disabled || locked}
                      onChange={(e) => setAccepted(r.composition_line_id, Number(e.target.value))}
                    />
                  </label>
                  <span className="tabular-nums text-slate-600">
                    Odrzut: <span className="font-semibold">{scrap}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
