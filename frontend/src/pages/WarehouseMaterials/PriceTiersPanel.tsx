/* eslint-disable react-refresh/only-export-components -- shared tier mappers used by carton/packaging detail */
import type { ReactNode } from "react";
import type { PriceTierDto, PriceTierWrite } from "../../api/cartonsApi";
import {
  formatWmMoneyAmount,
  normalizeWmMoneyInputString,
  numberToEditableMoneyString,
  parseMoneyToOptionalRounded,
  parseOptionalPositiveQuantity,
  normalizeWmQuantityInputString,
} from "../../modules/warehouseMaterials/warehouseMaterialsMoney";
import {
  wmInputClass,
  wmLabelClass,
  wmPrimaryBtnClass,
} from "../../modules/warehouseMaterials/warehouseMaterialsUi";

export type TierDraft = {
  qty_from: string;
  package_qty: string;
  package_net_total: string;
  package_gross_total: string;
};

export function tiersFromDto(rows: PriceTierDto[] | undefined): TierDraft[] {
  if (!rows?.length) return [{ qty_from: "1", package_qty: "", package_net_total: "", package_gross_total: "" }];
  return rows.map((r) => ({
    qty_from: String(r.qty_from ?? 1),
    package_qty: r.package_qty != null ? numberToEditableMoneyString(Number(r.package_qty)) : "",
    package_net_total: r.package_net_total != null ? numberToEditableMoneyString(Number(r.package_net_total)) : "",
    package_gross_total: r.package_gross_total != null ? numberToEditableMoneyString(Number(r.package_gross_total)) : "",
  }));
}

export function tiersToPayload(drafts: TierDraft[]): PriceTierWrite[] {
  return drafts.map((d) => {
    const qf = parseFloat(String(d.qty_from).replace(",", "."));
    const pq = parseOptionalPositiveQuantity(d.package_qty);
    const pn = parseMoneyToOptionalRounded(d.package_net_total);
    const pg = parseMoneyToOptionalRounded(d.package_gross_total);
    return {
      qty_from: Number.isFinite(qf) && qf >= 0 ? qf : 1,
      package_qty: pq,
      package_net_total: pn,
      package_gross_total: pg,
    };
  });
}

type Props = {
  vatRatePct: string;
  onVatChange: (v: string) => void;
  packageQty: string;
  onPackageQty: (v: string) => void;
  packageNet: string;
  onPackageNet: (v: string) => void;
  packageGross: string;
  onPackageGross: (v: string) => void;
  tiers: TierDraft[];
  onTiersChange: (next: TierDraft[]) => void;
  summaryReadonly?: PriceTierDto[];
};

function Subsection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h3>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function PriceTiersPanel({
  vatRatePct,
  onVatChange,
  packageQty,
  onPackageQty,
  packageNet,
  onPackageNet,
  packageGross,
  onPackageGross,
  tiers,
  onTiersChange,
  summaryReadonly,
}: Props) {
  const addRow = () => {
    onTiersChange([...tiers, { qty_from: "1", package_qty: "", package_net_total: "", package_gross_total: "" }]);
  };
  const removeRow = (idx: number) => {
    onTiersChange(tiers.filter((_, i) => i !== idx));
  };
  const patchRow = (idx: number, part: Partial<TierDraft>) => {
    onTiersChange(tiers.map((r, i) => (i === idx ? { ...r, ...part } : r)));
  };

  return (
    <div className="space-y-8">
      <Subsection
        title="VAT i opakowanie bazowe"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className={wmLabelClass}>VAT %</span>
            <input
              className={wmInputClass}
              value={vatRatePct}
              onChange={(e) => onVatChange(e.target.value)}
              onBlur={() => onVatChange(normalizeWmMoneyInputString(vatRatePct))}
              inputMode="decimal"
            />
          </label>
          <label>
            <span className={wmLabelClass}>Ilość w opakowaniu (szt.)</span>
            <input
              className={wmInputClass}
              value={packageQty}
              onChange={(e) => onPackageQty(e.target.value)}
              onBlur={() => onPackageQty(normalizeWmQuantityInputString(packageQty))}
              inputMode="numeric"
            />
          </label>
          <label>
            <span className={wmLabelClass}>Netto całe opakowanie</span>
            <input
              className={wmInputClass}
              value={packageNet}
              onChange={(e) => onPackageNet(e.target.value)}
              onBlur={() => onPackageNet(normalizeWmMoneyInputString(packageNet))}
              inputMode="decimal"
            />
          </label>
          <label>
            <span className={wmLabelClass}>Brutto całe opakowanie</span>
            <input
              className={wmInputClass}
              value={packageGross}
              onChange={(e) => onPackageGross(e.target.value)}
              onBlur={() => onPackageGross(normalizeWmMoneyInputString(packageGross))}
              inputMode="decimal"
            />
          </label>
        </div>
      </Subsection>

      <Subsection
        title="Progi cenowe"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500 md:hidden">Każdy próg jako karta — przewiń w poziomie na wąskim ekranie.</p>
          <button type="button" onClick={addRow} className={wmPrimaryBtnClass}>
            + Dodaj
          </button>
        </div>

        <div className="hidden gap-2 rounded-t-lg border border-b-0 border-slate-200 bg-slate-50/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 lg:grid lg:grid-cols-[minmax(0,0.75fr)_minmax(0,0.75fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_auto]">
          <span>Qty od</span>
          <span>Opak. szt.</span>
          <span>Netto opak.</span>
          <span>Brutto opak.</span>
          <span>Netto / j.u.</span>
          <span>Brutto / j.u.</span>
          <span>Rabat %</span>
          <span className="text-right">Akcje</span>
        </div>

        <div className="space-y-3 lg:space-y-0 lg:rounded-b-lg lg:border lg:border-slate-200 lg:bg-white">
          {tiers.map((row, idx) => {
            const ro = summaryReadonly?.[idx];
            return (
              <div
                key={idx}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:rounded-none lg:border-0 lg:border-t lg:border-slate-100 lg:shadow-none"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,0.75fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_auto] lg:items-end lg:gap-2 lg:px-3 lg:py-2.5">
                  <label>
                    <span className={wmLabelClass}>Qty od</span>
                    <input
                      className={wmInputClass}
                      value={row.qty_from}
                      onChange={(e) => patchRow(idx, { qty_from: e.target.value })}
                      onBlur={() => patchRow(idx, { qty_from: normalizeWmMoneyInputString(row.qty_from) || "1" })}
                      inputMode="decimal"
                    />
                  </label>
                  <label>
                    <span className={wmLabelClass}>Opak. szt.</span>
                    <input
                      className={wmInputClass}
                      value={row.package_qty}
                      onChange={(e) => patchRow(idx, { package_qty: e.target.value })}
                      onBlur={() => patchRow(idx, { package_qty: normalizeWmQuantityInputString(row.package_qty) })}
                      inputMode="numeric"
                    />
                  </label>
                  <label>
                    <span className={wmLabelClass}>Netto opak.</span>
                    <input
                      className={wmInputClass}
                      value={row.package_net_total}
                      onChange={(e) => patchRow(idx, { package_net_total: e.target.value })}
                      onBlur={() => patchRow(idx, { package_net_total: normalizeWmMoneyInputString(row.package_net_total) })}
                      inputMode="decimal"
                    />
                  </label>
                  <label>
                    <span className={wmLabelClass}>Brutto opak.</span>
                    <input
                      className={wmInputClass}
                      value={row.package_gross_total}
                      onChange={(e) => patchRow(idx, { package_gross_total: e.target.value })}
                      onBlur={() => patchRow(idx, { package_gross_total: normalizeWmMoneyInputString(row.package_gross_total) })}
                      inputMode="decimal"
                    />
                  </label>
                  <div>
                    <span className={wmLabelClass}>Netto / j.u.</span>
                    <div className={`${wmInputClass} flex h-9 items-center bg-slate-50 font-mono text-xs text-slate-700`}>
                      {formatWmMoneyAmount(ro?.unit_net ?? null)}
                    </div>
                  </div>
                  <div>
                    <span className={wmLabelClass}>Brutto / j.u.</span>
                    <div className={`${wmInputClass} flex h-9 items-center bg-slate-50 font-mono text-xs text-slate-700`}>
                      {formatWmMoneyAmount(ro?.unit_gross ?? null)}
                    </div>
                  </div>
                  <div>
                    <span className={wmLabelClass}>Rabat %</span>
                    <div className={`${wmInputClass} flex h-9 items-center bg-slate-50 font-mono text-xs text-slate-700`}>
                      {ro?.discount_pct != null ? `${ro.discount_pct.toFixed(1)}%` : "—"}
                    </div>
                  </div>
                  <div className="flex items-end justify-end sm:col-span-2 lg:col-span-1">
                    <button
                      type="button"
                      className="text-sm font-semibold text-red-600 hover:text-red-800 disabled:opacity-40"
                      onClick={() => removeRow(idx)}
                      disabled={tiers.length <= 1}
                    >
                      Usuń
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Subsection>
    </div>
  );
}
