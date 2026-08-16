import { useEffect, useState } from "react";
import type { FinishedGoodsIdentityBody } from "@/api/productionApi";
import { PrimaryButton, ProgressBar, SecondaryButton, toneTextClass } from "@/design-system";
import { formatProductionQuantity, productionProgressTone } from "../productionUi";
import {
  buildFgIdentityBody,
  canSubmitFgProduction,
  clampProduceQtyInput,
  paperProduceDefaultQty,
  parseFgSerialList,
} from "../productionFgIdentity";
import { ProductThumb } from "./ProductThumb";

type Props = {
  productName: string;
  productImageUrl?: string | null;
  plannedQuantity: number;
  completedQuantity: number;
  busy: boolean;
  /** Effective FG policy from API resolver (per product). */
  requireBatch?: boolean;
  requireSerial?: boolean;
  requireExpiry?: boolean;
  /** When false (single-line job), omit line progress if parent shows none — always show here for single. */
  showProgress?: boolean;
  onProduce: (qty: number, identity: FinishedGoodsIdentityBody) => void;
};

function fmtQty(n: number): string {
  return formatProductionQuantity(n);
}

/**
 * Paper production registration — qty form (default = remaining), not +1/+5 terminal simulation.
 */
export function PaperProduceLineCard({
  productName,
  productImageUrl,
  plannedQuantity,
  completedQuantity,
  busy,
  requireBatch = false,
  requireSerial = false,
  requireExpiry = false,
  showProgress = true,
  onProduce,
}: Props) {
  const remaining = Math.max(0, plannedQuantity - completedQuantity);
  const lineDone = remaining <= 1e-6;
  const pct =
    plannedQuantity > 0 ? Math.round(Math.min(100, (completedQuantity / plannedQuantity) * 100)) : 0;
  const tone = productionProgressTone(pct, lineDone ? "completed" : "in_progress");

  const [qtyText, setQtyText] = useState(String(paperProduceDefaultQty(remaining)));
  const [fgBatchNumber, setFgBatchNumber] = useState("");
  const [fgExpiryDate, setFgExpiryDate] = useState("");
  const [fgSerials, setFgSerials] = useState("");

  useEffect(() => {
    setQtyText(String(paperProduceDefaultQty(remaining)));
    setFgBatchNumber("");
    setFgExpiryDate("");
    setFgSerials("");
  }, [remaining, plannedQuantity, completedQuantity]);

  const qty = Number(qtyText.replace(",", "."));
  const identityFields = {
    batchNumber: fgBatchNumber,
    expiryDate: fgExpiryDate,
    serialsRaw: fgSerials,
  };
  const canSubmit =
    !lineDone &&
    canSubmitFgProduction(qty, remaining, identityFields, {
      requireBatch,
      requireSerial,
      requireExpiry,
    });

  const adjustQty = (delta: number) => {
    const current = Number(qtyText.replace(",", "."));
    const base = Number.isFinite(current) ? current : paperProduceDefaultQty(remaining);
    setQtyText(String(clampProduceQtyInput(base + delta, remaining)));
  };

  const setRemainingQty = () => {
    setQtyText(String(paperProduceDefaultQty(remaining)));
  };

  const submit = () => {
    if (!canSubmit || busy) return;
    onProduce(qty, buildFgIdentityBody({
      batchNumber: fgBatchNumber,
      expiryDate: fgExpiryDate,
      serialsRaw: fgSerials,
    }));
  };

  const needsIdentity = requireBatch || requireSerial || requireExpiry;
  const expectedSerials = Math.floor(Number.isFinite(qty) && qty > 0 ? qty : remaining);
  const serialCount = parseFgSerialList(fgSerials).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <ProductThumb imageUrl={productImageUrl} name={productName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-slate-900">{productName}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              <dt className="text-slate-500">Plan</dt>
              <dd className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{fmtQty(plannedQuantity)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              <dt className="text-slate-500">Wyprodukowano</dt>
              <dd className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{fmtQty(completedQuantity)}</dd>
            </div>
            <div className="rounded-lg bg-amber-50 px-2 py-2">
              <dt className="text-amber-800/80">Pozostało</dt>
              <dd className="mt-0.5 text-sm font-bold tabular-nums text-amber-950">{fmtQty(remaining)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {showProgress ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-slate-600">Postęp produkcji</span>
            <span className={`tabular-nums font-bold ${toneTextClass[tone]}`}>{pct}%</span>
          </div>
          <ProgressBar value={pct} tone={tone} size="md" />
        </div>
      ) : null}

      {lineDone ? (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-900">
          Linia wyprodukowana.
        </p>
      ) : (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <label className="block text-sm font-semibold text-slate-800">
            Wyprodukowano teraz
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <SecondaryButton
                type="button"
                density="compact"
                disabled={busy || qty <= 1}
                onClick={() => adjustQty(-1)}
                aria-label="Zmniejsz o 1"
              >
                −
              </SecondaryButton>
              <input
                type="number"
                min={1}
                max={Math.floor(remaining)}
                step={1}
                value={qtyText}
                disabled={busy}
                onChange={(e) => setQtyText(e.target.value)}
                className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-lg font-bold tabular-nums text-slate-900"
                data-testid="paper-produce-qty"
              />
              <span className="text-sm text-slate-500">szt.</span>
              <SecondaryButton
                type="button"
                density="compact"
                disabled={busy || remaining < 1}
                onClick={() => adjustQty(1)}
                aria-label="Zwiększ o 1"
              >
                +1
              </SecondaryButton>
              {remaining > 1 ? (
                <SecondaryButton
                  type="button"
                  density="compact"
                  disabled={busy}
                  onClick={() => adjustQty(5)}
                  aria-label="Zwiększ o 5"
                >
                  +5
                </SecondaryButton>
              ) : null}
              {paperProduceDefaultQty(remaining) > 0 ? (
                <SecondaryButton
                  type="button"
                  density="compact"
                  disabled={busy}
                  onClick={setRemainingQty}
                >
                  Pozostałe {fmtQty(remaining)}
                </SecondaryButton>
              ) : null}
            </div>
          </label>

          {needsIdentity ? (
            <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-900">
                Identyfikowalność tej rejestracji
              </p>
              {requireBatch ? (
                <label className="block text-xs font-semibold text-slate-600">
                  Numer partii (LOT)
                  <input
                    value={fgBatchNumber}
                    disabled={busy}
                    onChange={(e) => setFgBatchNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    data-testid="paper-produce-lot"
                  />
                </label>
              ) : null}
              {requireExpiry ? (
                <label className="block text-xs font-semibold text-slate-600">
                  Data ważności
                  <input
                    type="date"
                    value={fgExpiryDate}
                    disabled={busy}
                    onChange={(e) => setFgExpiryDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    data-testid="paper-produce-expiry"
                  />
                </label>
              ) : null}
              {requireSerial ? (
                <label className="block text-xs font-semibold text-slate-600">
                  Numery seryjne ({expectedSerials} unikalnych SN
                  {serialCount > 0 ? ` · podano ${serialCount}` : ""})
                  <textarea
                    value={fgSerials}
                    disabled={busy}
                    rows={3}
                    placeholder="Jeden numer w wierszu"
                    onChange={(e) => setFgSerials(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    data-testid="paper-produce-serials"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          <PrimaryButton
            type="button"
            density="comfortable"
            disabled={busy || !canSubmit}
            onClick={submit}
            className="w-full py-3.5 text-base"
            data-testid="paper-produce-submit"
          >
            {busy ? "Zapisywanie…" : "Zatwierdź produkcję"}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
