import type { InventoryPostingPreview } from "@/api/inventoryCountApi";

type Props = {
  open: boolean;
  mode: "submit" | "approve" | "post";
  preview: InventoryPostingPreview | null;
  loading?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const MODE_TITLE = {
  submit: "Wyślij do zatwierdzenia",
  approve: "Zatwierdź inwentaryzację",
  post: "Księguj korekty magazynowe",
};

export default function InventoryApprovalSummaryModal({
  open,
  mode,
  preview,
  loading,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  const updatesStock = preview?.updates_stock ?? true;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">{MODE_TITLE[mode]}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {mode === "post" && updatesStock
              ? "Podgląd dokumentów RW/PW — zmiany fizyczne w magazynie"
              : mode === "post" && !updatesStock
                ? "Dokument zostanie zamknięty bez korekt stanów"
                : "Podsumowanie przed przekazaniem do zatwierdzenia"}
          </p>
        </div>

        {loading || !preview ? (
          <p className="px-4 py-8 text-center text-xs text-slate-500">Wczytywanie podsumowania…</p>
        ) : (
          <div className="space-y-3 px-4 py-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Braki (RW)" value={preview.shortage_lines} />
              <Stat label="Nadwyżki (PW)" value={preview.surplus_lines} />
              <Stat label="Nieznane produkty" value={preview.unknown_products_count} />
              <Stat label="Lokalizacje" value={preview.affected_locations_count} />
            </div>

            {updatesStock ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="font-bold text-slate-800">Wartość korekt (netto)</p>
                <p className="mt-1 text-rose-700">Braki: −{preview.total_shortage_value_net.toLocaleString("pl-PL")} PLN</p>
                <p className="text-emerald-700">Nadwyżki: +{preview.total_surplus_value_net.toLocaleString("pl-PL")} PLN</p>
                <p className="mt-1 font-semibold text-slate-900">
                  Saldo: {preview.net_correction_value >= 0 ? "+" : ""}
                  {preview.net_correction_value.toLocaleString("pl-PL")} PLN
                </p>
                <p className="mt-1 text-[10px] text-slate-500">{preview.valuation_label}</p>
              </div>
            ) : null}

            {updatesStock && (preview.rw_preview.length > 0 || preview.pw_preview.length > 0) ? (
              <div>
                <p className="font-bold text-slate-700">Podgląd RW/PW (max 50 poz.)</p>
                {preview.rw_preview.length > 0 ? (
                  <PreviewBlock title="RW — rozchód" lines={preview.rw_preview} tone="shortage" />
                ) : null}
                {preview.pw_preview.length > 0 ? (
                  <PreviewBlock title="PW — przychód" lines={preview.pw_preview} tone="surplus" />
                ) : null}
              </div>
            ) : null}

            {preview.unresolved_conflicts > 0 ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-900">
                Uwaga: {preview.unresolved_conflicts} nierozwiązanych konfliktów liczenia — rozwiąż przed księgowaniem.
              </p>
            ) : null}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold">
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy || loading || !preview}
            onClick={onConfirm}
            className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {mode === "post" ? (updatesStock ? "Księguj RW/PW" : "Zakończ") : "Potwierdź"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-100 bg-white px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function PreviewBlock({
  title,
  lines,
  tone,
}: {
  title: string;
  lines: InventoryPostingPreview["rw_preview"];
  tone: "shortage" | "surplus";
}) {
  return (
    <div className="mt-1 max-h-32 overflow-auto rounded border border-slate-100">
      <p
        className={`sticky top-0 px-2 py-0.5 text-[10px] font-bold ${
          tone === "shortage" ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"
        }`}
      >
        {title}
      </p>
      <ul className="divide-y divide-slate-50">
        {lines.map((ln) => (
          <li key={ln.line_id} className="px-2 py-1 text-[11px]">
            <span className="font-semibold">{ln.sku ?? ln.product_id}</span>
            <span className="text-slate-500"> · {ln.location_name}</span>
            {ln.carrier_code ? <span className="text-[#1e4d8c]"> · {ln.carrier_code}</span> : null}
            <span className="float-right tabular-nums font-bold">{ln.quantity} szt.</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
