import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, FileSpreadsheet, ShieldCheck } from "lucide-react";

import api from "../../api/axios";
import {
  fetchInventoryDocument,
  getDocumentDifferenceAnalysis,
  listDocumentLines,
  type InventoryDocumentRead,
  type InventoryLineRead,
} from "../../api/inventoryCountApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { erpInventoryCountPaths } from "../../modules/inventoryCount/inventoryCountPaths";

const STATUS_PL: Record<string, string> = {
  draft: "Szkic",
  planned: "Zaplanowana",
  in_progress: "W trakcie",
  awaiting_approval: "Do zatwierdzenia",
  approved: "Zatwierdzona",
  posted: "Zaksięgowana",
};

export default function InventoryCountDocumentDetailPage() {
  const { documentId } = useParams();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? 1;
  const id = Number(documentId);
  const [doc, setDoc] = useState<InventoryDocumentRead | null>(null);
  const [lines, setLines] = useState<InventoryLineRead[]>([]);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof getDocumentDifferenceAnalysis>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setErr(null);
    try {
      const [d, ln, diff] = await Promise.all([
        fetchInventoryDocument(tenantId, id),
        listDocumentLines(tenantId, id),
        getDocumentDifferenceAnalysis(tenantId, id),
      ]);
      setDoc(d);
      setLines(ln);
      setAnalysis(diff);
    } catch {
      setErr("Nie udało się wczytać dokumentu inwentaryzacji.");
    }
  }, [tenantId, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const action = async (path: string) => {
    setBusy(true);
    try {
      await api.post(`/inventory-count/documents/${id}/${path}`, { notes: null }, { params: { tenant_id: tenantId } });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const downloadReport = (kind: string, format: "xlsx" | "pdf" = "xlsx") => {
    window.open(`/api/inventory-count/documents/${id}/reports/${kind}?tenant_id=${tenantId}&format=${format}`, "_blank");
  };

  const downloadAuditPackage = () => {
    window.open(`/api/inventory-count/documents/${id}/audit-package?tenant_id=${tenantId}`, "_blank");
  };

  if (err) return <p className="text-sm text-rose-600">{err}</p>;
  if (!doc) return <p className="text-sm text-slate-500">Wczytywanie…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-teal-600">Dokument inwentaryzacji</p>
          <h2 className="text-xl font-semibold text-slate-900">{doc.number}</h2>
          <p className="text-sm text-slate-500">
            {doc.inventory_type} · {STATUS_PL[doc.status] ?? doc.status} · pokrycie {doc.coverage_percent}%
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {doc.status === "in_progress" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void action("submit-approval")}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Wyślij do zatwierdzenia
            </button>
          ) : null}
          {doc.status === "awaiting_approval" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void action("approve")}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Zatwierdź
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void action("reject")}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium"
              >
                Odrzuć
              </button>
            </>
          ) : null}
          {doc.status === "approved" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void action("post")}
              className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white"
            >
              Księguj korekty RW/PW
            </button>
          ) : null}
          <button
            type="button"
            onClick={downloadAuditPackage}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <Download className="h-4 w-4" /> Pakiet audytu
          </button>
        </div>
      </div>

      {analysis ? (
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Różnice</p>
            <p className="text-2xl font-semibold">{doc.difference_lines}</p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Wpływ netto</p>
            <p className="text-2xl font-semibold tabular-nums">{analysis.total_value_impact_net.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Do recount</p>
            <p className="text-2xl font-semibold">{analysis.summary.mandatory_recount ?? analysis.summary["mandatory_recount"] ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Pozycje</p>
            <p className="text-2xl font-semibold">
              {doc.counted_lines}/{doc.total_lines}
            </p>
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Protokół różnic</h3>
          <div className="flex gap-2">
            <button type="button" onClick={() => downloadReport("differences")} className="inline-flex items-center gap-1 text-sm text-teal-700">
              <FileSpreadsheet className="h-4 w-4" /> XLSX
            </button>
            <button type="button" onClick={() => downloadReport("counting_sheet")} className="inline-flex items-center gap-1 text-sm text-teal-700">
              <ShieldCheck className="h-4 w-4" /> Spis z natury
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Lokalizacja</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Oczekiwana</th>
                <th className="px-3 py-2">Policzona</th>
                <th className="px-3 py-2">Różnica</th>
                <th className="px-3 py-2">Klasa</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln) => (
                <tr key={ln.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{ln.location_name ?? ln.location_id}</td>
                  <td className="px-3 py-2">{ln.sku}</td>
                  <td className="px-3 py-2 tabular-nums">{ln.expected_quantity ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{ln.counted_quantity ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{ln.difference_quantity ?? "—"}</td>
                  <td className="px-3 py-2 text-xs uppercase text-slate-500">{ln.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Link to={erpInventoryCountPaths.documents} className="text-sm text-teal-700 hover:underline">
        ← Lista dokumentów
      </Link>
    </div>
  );
}
