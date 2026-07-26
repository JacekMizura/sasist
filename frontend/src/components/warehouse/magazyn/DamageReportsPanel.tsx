import { useEffect, useMemo, useState } from "react";
import {
  createDamageEntry,
  getDamageReport,
  listDamageEntries,
  listDamageReports,
  reviewDamageEntry,
} from "../../../api/damageReportsApi";
import {
  Input,
  PrimaryButton,
  SecondaryButton,
  Select,
  StatusBadge,
  TabItem,
  Tabs,
} from "../../../design-system";
import { generateDamageReportPDF } from "../../../pdf/generateDamageReportPDF";
import type {
  DamageCandidate,
  DamageDecision,
  DamageEntry,
  DamageReport,
  DamageType,
} from "../../../types/damageReport";
import { AppOverlayPortal } from "../../../components/overlay";
import {
  DAMAGE_DECISION_OPTIONS,
  labelDamageDecision,
  labelDamageEntryStatus,
  labelDamageReportStatus,
  toneDamageDecision,
  toneDamageEntryStatus,
  toneDamageReportStatus,
} from "./damageUiLabels";

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
  const [createdBy, setCreatedBy] = useState("");
  const [selectedCandidateKey, setSelectedCandidateKey] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [photoUrl, setPhotoUrl] = useState("");
  const [officeQuery, setOfficeQuery] = useState("");
  const [officeStatusFilter, setOfficeStatusFilter] = useState<"all" | "NEW" | "REVIEWED">("all");
  const [officeDraft, setOfficeDraft] = useState<
    Record<number, { damage_type: DamageType; description: string; decision: DamageDecision }>
  >({});
  const [busyEntryId, setBusyEntryId] = useState<number | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);

  const byKey = useMemo(
    () => new Map(candidates.map((c) => [`${c.productId}|${c.locationUUID}`, c] as const)),
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

  const filteredEntries = useMemo(() => {
    const q = officeQuery.trim().toLowerCase();
    return entries.filter((e) => {
      if (officeStatusFilter !== "all" && e.status !== officeStatusFilter) return false;
      if (!q) return true;
      const hay = `${e.product_name} ${e.sku ?? ""} ${e.location_label ?? ""} ${e.location_uuid}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, officeQuery, officeStatusFilter]);

  if (!open) return null;

  return (
    <AppOverlayPortal>
      <div
        className="fixed inset-0 z-[280] flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          className="flex max-h-[min(90vh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="szkody-title"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h3 id="szkody-title" className="text-base font-semibold text-slate-900">
              Szkody
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              Zamknij
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <Tabs className="mb-4 gap-4">
              <TabItem active={tab === "wms"} onClick={() => setTab("wms")}>
                WMS
              </TabItem>
              <TabItem active={tab === "office"} onClick={() => setTab("office")}>
                Biuro
              </TabItem>
              <TabItem active={tab === "reports"} onClick={() => setTab("reports")}>
                Raporty
              </TabItem>
            </Tabs>

            {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

            {tab === "wms" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Produkt</label>
                    <Select
                      density="comfortable"
                      focusTone="brand"
                      className="w-full"
                      value={selectedCandidateKey}
                      onChange={(e) => setSelectedCandidateKey(e.target.value)}
                    >
                      <option value="">Produkt…</option>
                      {candidates.map((x) => (
                        <option
                          key={`${x.productId}|${x.locationUUID}`}
                          value={`${x.productId}|${x.locationUUID}`}
                        >
                          {x.productName} ({x.sku || "—"}) • {x.locationLabel}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Ilość</label>
                    <Input
                      type="number"
                      min={1}
                      density="comfortable"
                      focusTone="brand"
                      className="w-full"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                      Osoba zgłaszająca
                    </label>
                    <Input
                      density="comfortable"
                      focusTone="brand"
                      className="w-full"
                      value={createdBy}
                      onChange={(e) => setCreatedBy(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Zdjęcie</label>
                    <Input
                      density="comfortable"
                      focusTone="brand"
                      className="w-full"
                      value={photoUrl}
                      onChange={(e) => setPhotoUrl(e.target.value)}
                      placeholder="Adres zdjęcia…"
                    />
                  </div>
                </div>
                <PrimaryButton
                  type="button"
                  onClick={async () => {
                    if (warehouseId == null) return;
                    const c = byKey.get(selectedCandidateKey);
                    if (!c) return alert("Wybierz produkt.");
                    if (!photoUrl.trim()) return alert("Brak zdjęcia.");
                    await createDamageEntry({
                      tenant_id: tenantId,
                      warehouse_id: warehouseId,
                      product_id: c.productId,
                      quantity,
                      photo_urls: [photoUrl.trim()],
                      created_by: createdBy || undefined,
                    });
                    const officeRows = await listDamageEntries(tenantId, warehouseId, [
                      "NEW",
                      "REVIEWED",
                    ]);
                    setEntries(officeRows);
                    setTab("office");
                  }}
                >
                  Zapisz
                </PrimaryButton>
              </div>
            )}

            {tab === "office" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_10rem]">
                  <Input
                    density="comfortable"
                    focusTone="brand"
                    className="w-full"
                    value={officeQuery}
                    onChange={(e) => setOfficeQuery(e.target.value)}
                    placeholder="Szukaj produktu…"
                  />
                  <Select
                    density="comfortable"
                    focusTone="brand"
                    className="w-full"
                    value={officeStatusFilter}
                    onChange={(e) =>
                      setOfficeStatusFilter(e.target.value as "all" | "NEW" | "REVIEWED")
                    }
                  >
                    <option value="all">Wszystkie</option>
                    <option value="NEW">Nowe</option>
                    <option value="REVIEWED">Zweryfikowane</option>
                  </Select>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Produkt</th>
                        <th className="px-3 py-2 text-left font-semibold">Lokalizacja</th>
                        <th className="px-3 py-2 text-right font-semibold">Ilość</th>
                        <th className="px-3 py-2 text-left font-semibold">Status</th>
                        <th className="px-3 py-2 text-left font-semibold">Opis</th>
                        <th className="px-3 py-2 text-left font-semibold">Decyzja</th>
                        <th className="px-3 py-2 text-left font-semibold">Akcja</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-slate-500" colSpan={7}>
                            Brak wpisów.
                          </td>
                        </tr>
                      ) : (
                        filteredEntries.map((e) => {
                          const draft = officeDraft[e.id] ?? {
                            damage_type: (e.damage_type ?? "mechanical") as DamageType,
                            description: e.description ?? "",
                            decision: (e.decision ?? "REPAIR") as DamageDecision,
                          };
                          return (
                            <tr key={e.id} className="border-t border-slate-100 align-top">
                              <td className="px-3 py-2 font-medium text-slate-800">{e.product_name}</td>
                              <td className="px-3 py-2 text-slate-600">
                                {e.location_label ?? e.location_uuid}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{e.quantity}</td>
                              <td className="px-3 py-2">
                                <StatusBadge tone={toneDamageEntryStatus(e.status)} density="compact">
                                  {labelDamageEntryStatus(e.status)}
                                </StatusBadge>
                              </td>
                              <td className="min-w-[8rem] px-3 py-2">
                                <Input
                                  density="compact"
                                  className="w-full min-w-[7rem]"
                                  value={draft.description}
                                  onChange={(ev) =>
                                    setOfficeDraft((p) => ({
                                      ...p,
                                      [e.id]: { ...draft, description: ev.target.value },
                                    }))
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Select
                                  density="compact"
                                  className="w-full min-w-[9rem]"
                                  value={draft.decision}
                                  onChange={(ev) =>
                                    setOfficeDraft((p) => ({
                                      ...p,
                                      [e.id]: {
                                        ...draft,
                                        decision: ev.target.value as DamageDecision,
                                      },
                                    }))
                                  }
                                >
                                  {DAMAGE_DECISION_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </Select>
                              </td>
                              <td className="px-3 py-2">
                                {e.status === "REVIEWED" ? (
                                  <StatusBadge tone={toneDamageDecision(e.decision)} density="compact">
                                    {labelDamageDecision(e.decision)}
                                  </StatusBadge>
                                ) : (
                                  <SecondaryButton
                                    type="button"
                                    density="compact"
                                    disabled={busyEntryId === e.id}
                                    onClick={async () => {
                                      setBusyEntryId(e.id);
                                      try {
                                        const reviewed = await reviewDamageEntry(e.id, tenantId, {
                                          damage_type: draft.damage_type,
                                          description: draft.description || undefined,
                                          decision: draft.decision,
                                        });
                                        setEntries((prev) =>
                                          prev.map((x) => (x.id === reviewed.id ? reviewed : x))
                                        );
                                      } finally {
                                        setBusyEntryId(null);
                                      }
                                    }}
                                  >
                                    Zweryfikuj
                                  </SecondaryButton>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === "reports" && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-semibold">Nazwa</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Data</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Liczba pozycji</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                      <th className="px-3 py-2.5 text-right font-semibold"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.length === 0 ? (
                      <tr>
                        <td className="px-3 py-4 text-slate-500" colSpan={5}>
                          Brak raportów.
                        </td>
                      </tr>
                    ) : (
                      reports.map((r) => (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="px-3 py-2.5 font-medium text-slate-800">{r.report_number}</td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {new Date(r.created_at).toLocaleString("pl-PL")}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {r.items?.length ?? 0}
                          </td>
                          <td className="px-3 py-2.5">
                            <StatusBadge tone={toneDamageReportStatus(r.status)} density="compact">
                              {labelDamageReportStatus(r.status)}
                            </StatusBadge>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <SecondaryButton
                              type="button"
                              density="compact"
                              disabled={pdfBusyId === r.id}
                              onClick={async () => {
                                setPdfBusyId(r.id);
                                try {
                                  const full =
                                    (r.items?.length ?? 0) > 0
                                      ? r
                                      : await getDamageReport(r.id, tenantId);
                                  await generateDamageReportPDF(full);
                                } finally {
                                  setPdfBusyId(null);
                                }
                              }}
                            >
                              Pobierz PDF
                            </SecondaryButton>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppOverlayPortal>
  );
}
