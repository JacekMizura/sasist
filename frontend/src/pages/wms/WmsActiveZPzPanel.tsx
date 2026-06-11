import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

import { closeActiveCollectiveZPz, getActiveCollectiveZPz } from "../../api/wmsReturnsApi";
import type { ActiveZPzRead } from "../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WMS_ROUTES } from "./wmsRoutes";
import { formatWmsListDate } from "./wmsListFormatters";

type Props = {
  warehouseId: number | null;
  refreshKey?: number;
  onClosed?: (documentNumber: string) => void;
};

export function WmsActiveZPzPanel({ warehouseId, refreshKey = 0, onClosed }: Props) {
  const [doc, setDoc] = useState<ActiveZPzRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (warehouseId == null || warehouseId <= 0) {
      setDoc(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const row = await getActiveCollectiveZPz({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId,
      });
      setDoc(row);
    } catch {
      setErr("Nie udało się wczytać aktywnego Z-PZ.");
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const handleClose = async () => {
    if (warehouseId == null || warehouseId <= 0 || closing) return;
    const ok = window.confirm(
      "Zamknąć aktywny dokument Z-PZ?\n\nNośnik trafi do kolejki rozlokowania. Kolejny zwrot utworzy nowy dokument.",
    );
    if (!ok) return;
    setClosing(true);
    setErr(null);
    try {
      const res = await closeActiveCollectiveZPz({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId,
      });
      setDoc(null);
      onClosed?.(res.document_number);
      void load();
    } catch (e: unknown) {
      let msg = "Nie udało się zamknąć dokumentu Z-PZ.";
      if (typeof e === "object" && e !== null && "response" in e) {
        const d = (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
        if (typeof d === "string" && d.trim()) msg = d.trim();
      }
      setErr(msg);
    } finally {
      setClosing(false);
    }
  };

  if (loading && !doc) return null;
  if (!doc) {
    if (err) {
      return (
        <div className="mx-auto mb-4 w-full max-w-5xl rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err}
        </div>
      );
    }
    return null;
  }

  const createdLabel = formatWmsListDate(doc.created_at ?? null);
  const labelUrl = WMS_ROUTES.returnsActiveZPzLabel(doc.stock_document_id);

  return (
    <section
      className="mx-auto mb-5 w-full max-w-5xl rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm md:p-5"
      aria-label="Aktywny dokument zwrotów"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Aktywny dokument zwrotów</p>
          <h2 className="mt-1 truncate text-xl font-black text-slate-900">{doc.document_number}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {doc.line_count}{" "}
            {doc.line_count === 1 ? "pozycja" : doc.line_count >= 2 && doc.line_count <= 4 ? "pozycje" : "pozycji"} ·{" "}
            {Math.round(doc.unit_sum * 100) / 100} szt.
            {createdLabel ? ` · utworzono ${createdLabel}` : ""}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Otwarty nośnik zwrotów — dodawaj RMZ do tego Z-PZ. Zamknij, gdy wózek / kosz jest pełny.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Link
            to={doc.detail_path}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Pokaż dokument
          </Link>
          <a
            href={labelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Drukuj etykietę
          </a>
          <button
            type="button"
            disabled={closing}
            onClick={() => void handleClose()}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-amber-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
          >
            {closing ? "Zamykanie…" : "Zamknij dokument"}
          </button>
        </div>
      </div>
      {err ? <p className="mt-3 text-sm text-rose-700">{err}</p> : null}
    </section>
  );
}

type LabelProps = {
  doc: ActiveZPzRead;
};

export function WmsActiveZPzLabelView({ doc }: LabelProps) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = barcodeRef.current;
    if (!el) return;
    try {
      JsBarcode(el, doc.barcode_value || `ZPZ-${doc.stock_document_id}`, {
        format: "CODE128",
        width: 2,
        height: 72,
        displayValue: true,
        fontSize: 14,
        margin: 8,
      });
    } catch {
      /* ignore invalid barcode */
    }
  }, [doc.barcode_value, doc.stock_document_id]);

  useEffect(() => {
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, []);

  const [qrSrc, setQrSrc] = useState<string | null>(null);
  useEffect(() => {
    const value = doc.barcode_value || `ZPZ-${doc.stock_document_id}`;
    void QRCode.toDataURL(value, { width: 200, margin: 1 }).then(setQrSrc).catch(() => setQrSrc(null));
  }, [doc.barcode_value, doc.stock_document_id]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-white p-6 print:min-h-0 print:p-4">
      <style>{`
        @media print {
          @page { size: 100mm 150mm; margin: 4mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <h1 className="text-center text-2xl font-black tracking-tight text-slate-900">{doc.document_number}</h1>
      <p className="mt-1 text-center text-sm font-semibold uppercase tracking-wide text-slate-500">Z-PZ · zwroty</p>
      {qrSrc ? (
        <img src={qrSrc} alt="Kod QR dokumentu Z-PZ" className="mt-4 h-40 w-40 object-contain" />
      ) : null}
      <svg ref={barcodeRef} className="mt-4 w-full max-w-xs" role="img" aria-label="Kod kreskowy" />
      <div className="mt-6 grid w-full grid-cols-2 gap-3 text-center text-sm">
        <div className="rounded-lg border border-slate-200 py-2">
          <p className="text-xs uppercase text-slate-500">Pozycje</p>
          <p className="text-xl font-bold text-slate-900">{doc.line_count}</p>
        </div>
        <div className="rounded-lg border border-slate-200 py-2">
          <p className="text-xs uppercase text-slate-500">Sztuki</p>
          <p className="text-xl font-bold text-slate-900">{Math.round(doc.unit_sum * 100) / 100}</p>
        </div>
      </div>
    </div>
  );
}
