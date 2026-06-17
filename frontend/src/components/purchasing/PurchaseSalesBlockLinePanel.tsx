import { useState } from "react";
import type { StockDocumentItemRead } from "../../api/stockDocumentsApi";
import {
  patchPurchaseLineSalesBlock,
  SALES_BLOCK_REASON_OPTIONS,
  type SalesBlockReasonCode,
} from "../../api/purchaseSalesBlockApi";

type Props = {
  tenantId: number;
  documentId: number;
  line: StockDocumentItemRead;
  onUpdated: () => void;
  variant?: "inline" | "drawer";
};

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:ring-2 focus:ring-amber-200";

export function PurchaseSalesBlockLinePanel({
  tenantId,
  documentId,
  line,
  onUpdated,
  variant = "inline",
}: Props) {
  const [blockedQty, setBlockedQty] = useState(String(line.sales_blocked_qty ?? 0));
  const [reason, setReason] = useState<SalesBlockReasonCode | "">(
    (line.sales_block_reason_code as SalesBlockReasonCode) || "",
  );
  const [note, setNote] = useState(line.sales_block_note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const received = Number(line.received_quantity ?? 0);
  const effectiveBlock = Number(line.sales_block_effective_qty ?? line.sales_blocked_qty ?? 0);
  const lineAvailable = Number(
    line.line_commercial_available_qty ?? Math.max(0, received - effectiveBlock),
  );

  async function save() {
    setErr(null);
    const qty = parseFloat(blockedQty.replace(",", "."));
    if (!Number.isFinite(qty) || qty < 0) {
      setErr("Podaj nieujemną ilość zablokowaną.");
      return;
    }
    if (qty > 0 && !reason) {
      setErr("Wybierz powód blokady.");
      return;
    }
    if (qty > 0 && reason === "OTHER" && note.trim().length < 3) {
      setErr("Przy powodzie „Inne” wymagana jest notatka (min. 3 znaki).");
      return;
    }
    setBusy(true);
    try {
      await patchPurchaseLineSalesBlock(tenantId, documentId, line.id, {
        sales_blocked_qty: qty,
        sales_block_reason_code: qty > 0 ? reason : null,
        sales_block_note: qty > 0 ? note.trim() || null : null,
      });
      onUpdated();
    } catch (e: unknown) {
      const detail =
        e && typeof e === "object" && "response" in e
          ? (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setErr(typeof detail === "string" ? detail : "Nie udało się zapisać blokady sprzedaży.");
    } finally {
      setBusy(false);
    }
  }

  const shellClass =
    variant === "drawer"
      ? "text-sm"
      : "mt-2 rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-3 text-sm";

  return (
    <div className={shellClass}>
      {variant === "inline" ? (
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900/80">Blokada sprzedaży</p>
      ) : null}
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs text-slate-600">
          Ilość niedopuszczona do sprzedaży
          <input
            type="number"
            min={0}
            step="any"
            className={`${inputClass} mt-1 tabular-nums`}
            value={blockedQty}
            onChange={(e) => setBlockedQty(e.target.value)}
          />
        </label>
        <label className="block text-xs text-slate-600">
          Powód
          <select
            className={`${inputClass} mt-1`}
            value={reason}
            onChange={(e) => setReason(e.target.value as SalesBlockReasonCode | "")}
          >
            <option value="">— wybierz —</option>
            {SALES_BLOCK_REASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-600 sm:col-span-2">
          Notatka
          <input
            type="text"
            className={`${inputClass} mt-1`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Opcjonalnie; wymagana przy „Inne”"
          />
        </label>
      </div>
      <dl className="mt-3 grid gap-1 text-xs text-slate-700 sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Przyjęto</dt>
          <dd className="font-semibold tabular-nums">{received}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Zablokowane</dt>
          <dd className="font-semibold tabular-nums text-amber-900">{effectiveBlock}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Dostępne do sprzedaży (linia)</dt>
          <dd className="font-semibold tabular-nums text-emerald-800">{lineAvailable}</dd>
        </div>
      </dl>
      {line.sales_block_reason_label ? (
        <p className="mt-1 text-xs text-slate-600">
          Powód: <span className="font-medium">{line.sales_block_reason_label}</span>
        </p>
      ) : null}
      {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {busy ? "Zapisywanie…" : "Zapisz blokadę"}
      </button>
    </div>
  );
}
