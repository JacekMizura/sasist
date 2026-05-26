import { useEffect, useMemo, useState } from "react";
import {
  confirmDamageReport,
  createDamageReport,
  getDamageReport,
  createDamageEntry,
  listDamageEntries,
  listDamageReports,
  reviewDamageEntry,
} from "../../../api/damageReportsApi";
import { generateDamageReportPDF } from "../../../pdf/generateDamageReportPDF";
import type {
  DamageCandidate,
  DamageDecision,
  DamageEntry,
  DamageReport,
  DamageType,
} from "../../../types/damageReport";

export type DamagePrefill = {
  productId: number;
  locationUUID: string;
  quantity?: number;
};

export type DamageReportsPanelProps = {
  open: boolean;
  tenantId: number;
  warehouseId: number | null;
  onClose: () => void;
  candidates: DamageCandidate[];
  prefill?: DamagePrefill | null;
};

function fmtPln(v: number): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN", maximumFractionDigits: 2 }).format(v);
}

function statusBadge(status: string): string {
  return status === "confirmed"
    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : "bg-amber-100 text-amber-700 border-amber-200";
}

export function DamageReportsPanel({
  open,
  tenantId,
  warehouseId,
  onClose,
  candidates,
  prefill,
}: DamageReportsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<DamageReport[]>([]);
  const [entries, setEntries] = useState<DamageEntry[]>([]);
  const [tab, setTab] = useState<"wms" | "office" | "reports">("wms");
  const [view, setView] = useState<"list" | "details">("list");
  const [selectedReport, setSelectedReport] = useState<DamageReport | null>(null);
  const [createdBy, setCreatedBy] = useState("");
  const [selectedCandidateKey, setSelectedCandidateKey] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [photoUrl, setPhotoUrl] = useState("");
  const [selectedReviewedEntryIds, setSelectedReviewedEntryIds] = useState<number[]>([]);
  const [officeDraft, setOfficeDraft] = useState<
    Record<number, { damage_type: DamageType; description: string; decision: DamageDecision; reviewed_by: string }>
  >({});
  const byKey = useMemo(
    () =>
      new Map(
        candidates.map((c) => [`${c.productId}|${c.locationUUID}`, c] as const)
      ),
    [candidates]
  );

  useEffect(() => {
    if (!open || warehouseId == null) return;
    void (async () => {
      setLoading(true);
      try {
        const [list, officeRows] = await Promise.all([
          listDamageReports(tenantId, warehouseId),
          listDamageEntries(tenantId, warehouseId, ["NEW", "REVIEWED"]),
        ]);
        setReports(list);
        setEntries(officeRows);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, tenantId, warehouseId]);

  useEffect(() => {
    if (!open || !prefill) return;
    const key = `${prefill.productId}|${prefill.locationUUID}`;
    if (!byKey.has(key)) return;
    setTab("wms");
    setSelectedCandidateKey(key);
    setQuantity(Math.max(1, Math.floor(prefill.quantity ?? 1)));
  }, [open, prefill, byKey]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full rounded-xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Szkody</h3>
          <div className="flex items-center gap-2">
            {view !== "list" && (
              <button type="button" onClick={() => setView("list")} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Wróć do listy
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700">
              Zamknij
            </button>
          </div>
        </div>

        {view === "list" && (
          <div className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <button type="button" onClick={() => setTab("wms")} className={`rounded-md px-3 py-2 text-xs font-semibold ${tab === "wms" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>WMS</button>
              <button type="button" onClick={() => setTab("office")} className={`rounded-md px-3 py-2 text-xs font-semibold ${tab === "office" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>Office</button>
              <button type="button" onClick={() => setTab("reports")} className={`rounded-md px-3 py-2 text-xs font-semibold ${tab === "reports" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>Reports</button>
            </div>
            {tab === "wms" && (
              <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">WMS (returns handling)</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Produkt (uszkodzona lokalizacja)</label>
                    <select value={selectedCandidateKey} onChange={(e) => setSelectedCandidateKey(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <option value="">Wybierz...</option>
                      {candidates.map((x) => <option key={`${x.productId}|${x.locationUUID}`} value={`${x.productId}|${x.locationUUID}`}>{x.productName} ({x.sku || "—"}) • {x.locationLabel}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Ilość</label>
                    <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">URL zdjęcia (wymagane — pierwsze z listy)</label>
                    <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Utworzył</label>
                    <input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (warehouseId == null) return;
                    const c = byKey.get(selectedCandidateKey);
                    if (!c) return alert("Wybierz produkt/lokalizację.");
                    if (!photoUrl.trim()) return alert("Photo URL jest wymagane.");
                    await createDamageEntry({
                      tenant_id: tenantId,
                      warehouse_id: warehouseId,
                      product_id: c.productId,
                      quantity,
                      photo_urls: [photoUrl.trim()],
                      created_by: createdBy || undefined,
                    });
                    const officeRows = await listDamageEntries(tenantId, warehouseId, ["NEW", "REVIEWED"]);
                    setEntries(officeRows);
                    setTab("office");
                  }}
                  className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  Zapisz DamageEntry (NEW)
                </button>
              </div>
            )}

            {tab === "office" && (
              <div className="overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Produkt</th>
                      <th className="px-3 py-2 text-left">Lokalizacja</th>
                      <th className="px-3 py-2 text-right">Ilość</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Opis</th>
                      <th className="px-3 py-2 text-left">Decyzja</th>
                      <th className="px-3 py-2 text-left">Akcja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const draft = officeDraft[e.id] ?? {
                        damage_type: (e.damage_type ?? "mechanical") as DamageType,
                        description: e.description ?? "",
                        decision: (e.decision ?? "REPAIR") as DamageDecision,
                        reviewed_by: "",
                      };
                      return (
                        <tr key={e.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">{e.product_name}</td>
                          <td className="px-3 py-2">{e.location_label ?? e.location_uuid}</td>
                          <td className="px-3 py-2 text-right">{e.quantity}</td>
                          <td className="px-3 py-2">{e.status}</td>
                          <td className="px-3 py-2"><input value={draft.description} onChange={(ev) => setOfficeDraft((p) => ({ ...p, [e.id]: { ...draft, description: ev.target.value } }))} className="w-full rounded border border-slate-200 px-2 py-1" /></td>
                          <td className="px-3 py-2">
                            <select value={draft.decision} onChange={(ev) => setOfficeDraft((p) => ({ ...p, [e.id]: { ...draft, decision: ev.target.value as DamageDecision } }))} className="rounded border border-slate-200 px-2 py-1">
                              <option value="SELLABLE">SELLABLE</option>
                              <option value="REPAIR">REPAIR</option>
                              <option value="RETURN_TO_SUPPLIER">RETURN_TO_SUPPLIER</option>
                              <option value="DISPOSE">DISPOSE</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={async () => {
                              const reviewed = await reviewDamageEntry(e.id, tenantId, {
                                damage_type: draft.damage_type,
                                description: draft.description || undefined,
                                decision: draft.decision,
                                reviewed_by: draft.reviewed_by || undefined,
                              });
                              setEntries((prev) => prev.map((x) => (x.id === reviewed.id ? reviewed : x)));
                            }} className="rounded bg-amber-600 px-2 py-1 text-white">
                              Oznacz REVIEWED
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "reports" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-900">Wybierz pozycje REVIEWED do raportu</p>
                  <div className="max-h-52 space-y-1 overflow-auto">
                    {entries.filter((e) => e.status === "REVIEWED").map((e) => (
                      <label key={e.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedReviewedEntryIds.includes(e.id)}
                          onChange={(ev) =>
                            setSelectedReviewedEntryIds((prev) =>
                              ev.target.checked ? [...prev, e.id] : prev.filter((x) => x !== e.id)
                            )
                          }
                        />
                        <span>{e.product_name} • {e.location_label ?? e.location_uuid} • {fmtPln(e.total_value)}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (warehouseId == null) return;
                      if (selectedReviewedEntryIds.length === 0) return alert("Wybierz REVIEWED entries.");
                      const created = await createDamageReport({
                        tenant_id: tenantId,
                        warehouse_id: warehouseId,
                        created_by: createdBy || undefined,
                        entry_ids: selectedReviewedEntryIds,
                      });
                      setSelectedReport(created);
                      setView("details");
                      const [list, officeRows] = await Promise.all([
                        listDamageReports(tenantId, warehouseId),
                        listDamageEntries(tenantId, warehouseId, ["NEW", "REVIEWED"]),
                      ]);
                      setReports(list);
                      setEntries(officeRows);
                      setSelectedReviewedEntryIds([]);
                    }}
                    className="mt-3 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    Utwórz protokół szkody
                  </button>
                </div>

                <div className="overflow-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Numer</th>
                        <th className="px-3 py-2 text-left">Data</th>
                        <th className="px-3 py-2 text-left">Magazyn</th>
                        <th className="px-3 py-2 text-right">Wartość</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((r) => (
                        <tr key={r.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={async () => {
                          const details = await getDamageReport(r.id, tenantId);
                          setSelectedReport(details);
                          setView("details");
                        }}>
                          <td className="px-3 py-2">{r.report_number}</td>
                          <td className="px-3 py-2">{new Date(r.created_at).toLocaleString("pl-PL")}</td>
                          <td className="px-3 py-2">{r.warehouse_name ?? r.warehouse_id}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmtPln(r.total_value)}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge(r.status)}`}>
                              {r.status === "confirmed" ? "zatwierdzony" : "draft"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {view === "details" && selectedReport && (
          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{selectedReport.report_number}</p>
                <p className="text-xs text-slate-600">{new Date(selectedReport.created_at).toLocaleString("pl-PL")}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => generateDamageReportPDF(selectedReport)} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Pobierz PDF
                </button>
                {selectedReport.status !== "confirmed" && (
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = await confirmDamageReport(selectedReport.id, tenantId);
                      setSelectedReport(confirmed);
                      setReports((prev) => prev.map((x) => (x.id === confirmed.id ? confirmed : x)));
                    }}
                    className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    Zatwierdź
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Produkt</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Lokalizacja</th>
                    <th className="px-3 py-2 text-right">Ilość</th>
                    <th className="px-3 py-2 text-right">Cena</th>
                    <th className="px-3 py-2 text-right">Wartość</th>
                    <th className="px-3 py-2 text-left">Typ szkody</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReport.items.map((it) => (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{it.product_name}</td>
                      <td className="px-3 py-2">{it.sku || "—"}</td>
                      <td className="px-3 py-2">{it.location_label || it.location_uuid}</td>
                      <td className="px-3 py-2 text-right">{it.quantity}</td>
                      <td className="px-3 py-2 text-right">{fmtPln(it.purchase_price)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtPln(it.total_value)}</td>
                      <td className="px-3 py-2">{it.damage_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-right text-sm font-semibold text-slate-900">
              Łączna wartość szkody: {fmtPln(selectedReport.total_value)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
