import { useEffect, useId, useState } from "react";

import type { FinishedGoodsIdentityBody } from "@/api/productionApi";
import type { ProductionTerminalDisplaySettings } from "@/api/wmsProductionSettingsApi";
import { AppOverlayPortal } from "@/components/overlay";
import { PrimaryButton, SecondaryButton } from "@/design-system";
import { formatProductionQuantity } from "../productionUi";
import {
  buildProductIdentityMetaLine,
  resolveProductUnit,
  resolveWmsProductionProductIdentity,
} from "../display/productionTerminalDisplay";

type Props = {
  open: boolean;
  display: ProductionTerminalDisplaySettings;
  productName: string;
  productSku?: string | null;
  productEan?: string | null;
  productCatalogNumber?: string | null;
  productBarcode?: string | null;
  productUnit?: string | null;
  plannedQty: number;
  producedQty: number;
  remainingQty: number;
  busy?: boolean;
  requireBatch?: boolean;
  requireSerial?: boolean;
  requireExpiry?: boolean;
  onClose: () => void;
  onConfirm: (qty: number, identity: FinishedGoodsIdentityBody) => void | Promise<void>;
};

/**
 * Modal „Zarejestruj produkcję” — domyślna ilość = pozostała do planu.
 */
export function RegisterProductionModal({
  open,
  display,
  productName,
  productSku,
  productEan,
  productCatalogNumber,
  productBarcode,
  productUnit,
  plannedQty,
  producedQty,
  remainingQty,
  busy = false,
  requireBatch = false,
  requireSerial = false,
  requireExpiry = false,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();
  const [qtyText, setQtyText] = useState(String(Math.floor(remainingQty)));
  const [fgBatchNumber, setFgBatchNumber] = useState("");
  const [fgExpiryDate, setFgExpiryDate] = useState("");
  const [fgSerials, setFgSerials] = useState("");

  useEffect(() => {
    if (!open) return;
    setQtyText(String(Math.max(0, Math.floor(remainingQty))));
    setFgBatchNumber("");
    setFgExpiryDate("");
    setFgSerials("");
  }, [open, remainingQty]);

  if (!open) return null;

  const qty = Number(qtyText.replace(",", "."));
  const qtyOk = Number.isFinite(qty) && qty > 0 && qty <= remainingQty + 1e-9;
  const serialList = fgSerials
    .split(/[\n,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const identityOk =
    (!requireBatch || Boolean(fgBatchNumber.trim())) &&
    (!requireExpiry || Boolean(fgExpiryDate)) &&
    (!requireSerial || serialList.length === Math.floor(qty));

  const productIdentity = resolveWmsProductionProductIdentity(display, {
    name: productName,
    sku: productSku,
    ean: productEan,
    catalogNumber: productCatalogNumber,
    barcode: productBarcode,
    unit: productUnit,
  });
  const metaLine = buildProductIdentityMetaLine(display, {
    sku: productSku,
    ean: productEan,
    catalogNumber: productCatalogNumber,
    barcode: productBarcode,
  });
  const unit = resolveProductUnit(productUnit);

  const submit = () => {
    if (!qtyOk || !identityOk || busy) return;
    void onConfirm(qty, {
      fg_batch_number: fgBatchNumber.trim() || null,
      fg_expiry_date: fgExpiryDate || null,
      fg_serial_numbers: serialList,
    });
  };

  return (
    <AppOverlayPortal>
      <div
        className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/40 p-4"
        role="presentation"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id={titleId} className="text-base font-bold text-slate-900">
            Zarejestruj produkcję
          </h3>
          {productIdentity.showName ? (
            <p className="mt-1 text-sm text-slate-600">{productName}</p>
          ) : null}
          {metaLine ? <p className="mt-0.5 font-mono text-xs text-slate-500">{metaLine}</p> : null}
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              <dt className="text-slate-500">Plan</dt>
              <dd className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
                {formatProductionQuantity(plannedQty)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              <dt className="text-slate-500">Wyprodukowano</dt>
              <dd className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
                {formatProductionQuantity(producedQty)}
              </dd>
            </div>
            <div className="rounded-lg bg-amber-50 px-2 py-2">
              <dt className="text-amber-800/80">Pozostało</dt>
              <dd className="mt-0.5 text-sm font-bold tabular-nums text-amber-950">
                {formatProductionQuantity(remainingQty)}
              </dd>
            </div>
          </dl>

          <label className="mt-4 block text-sm font-semibold text-slate-800">
            Wyprodukowano
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={Math.floor(remainingQty)}
                step={1}
                value={qtyText}
                disabled={busy}
                onChange={(e) => setQtyText(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-lg font-bold tabular-nums text-slate-900"
              />
              {display.show_unit ? <span className="shrink-0 text-sm text-slate-500">{unit}</span> : null}
            </div>
          </label>

          {requireBatch || requireSerial || requireExpiry ? (
            <div className="mt-4 space-y-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
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
                  />
                </label>
              ) : null}
              {requireSerial ? (
                <label className="block text-xs font-semibold text-slate-600">
                  Numery seryjne ({Math.floor(qtyOk ? qty : remainingQty)} unikalnych SN)
                  <textarea
                    value={fgSerials}
                    disabled={busy}
                    rows={3}
                    placeholder="Jeden numer w wierszu"
                    onChange={(e) => setFgSerials(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex gap-2">
            <SecondaryButton type="button" className="flex-1" disabled={busy} onClick={onClose}>
              Anuluj
            </SecondaryButton>
            <PrimaryButton
              type="button"
              className="flex-1"
              disabled={busy || !qtyOk || !identityOk}
              onClick={submit}
            >
              {busy ? "Zapisywanie…" : "Zatwierdź"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </AppOverlayPortal>
  );
}
