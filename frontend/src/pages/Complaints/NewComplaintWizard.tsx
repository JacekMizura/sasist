import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

import api from "../../api/axios";
import { createComplaintFromOrder } from "../../api/complaintsApi";
import { COMPLAINT_DEFECT_TAG_OPTIONS } from "../../constants/complaintDefectTags";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";

type OrderLite = {
  id: number;
  number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  value?: number | null;
};

type OrderItemRow = {
  id: number;
  quantity: number;
  unit_price?: number | null;
  product?: { name?: string | null; sku?: string | null; symbol?: string | null; ean?: string | null };
};

type OrderLoaded = {
  id: number;
  number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  source?: string | null;
  value?: number | null;
  currency?: string | null;
  addresses_json?: string | null;
  items: OrderItemRow[];
};

type LineDraft = { selected: boolean; qty: number; photos: PhotoSlot[]; defect_ids: string[] };

type PhotoSlot = { id: string; file: File; url: string };

type ComplaintFormState = {
  note: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
};

const EMPTY_FORM: ComplaintFormState = {
  note: "",
  customer_name: "",
  customer_phone: "",
  customer_email: "",
};

function deepFindStr(obj: unknown, wantKeys: Set<string>): string | null {
  if (obj == null) return null;
  if (typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (wantKeys.has(k.toLowerCase()) && v != null) {
        const s = String(v).trim();
        if (s) return s;
      }
    }
    for (const v of Object.values(obj as Record<string, unknown>)) {
      const r = deepFindStr(v, wantKeys);
      if (r) return r;
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = deepFindStr(item, wantKeys);
      if (r) return r;
    }
  }
  return null;
}

function contactFromAddressesJson(raw: string | null | undefined): { phone: string; email: string } {
  if (!raw?.trim()) return { phone: "", email: "" };
  try {
    const data = JSON.parse(raw) as unknown;
    const phone = deepFindStr(data, new Set(["phone", "telephone", "tel", "mobile", "phone_number"]));
    const email = deepFindStr(data, new Set(["email", "e_mail", "mail"]));
    return { phone: phone ?? "", email: email ?? "" };
  } catch {
    return { phone: "", email: "" };
  }
}

function customerNameFromOrder(o: OrderLoaded): string {
  return [o.first_name?.trim(), o.last_name?.trim()].filter(Boolean).join(" ");
}

export type NewComplaintWizardProps = {
  open: boolean;
  onClose: () => void;
  warehouseId: number;
  /** Defaults to panel tenant. */
  tenantId?: number;
  initialOrderId?: number | null;
  initialOrderItemIds?: number[];
  initialCustomerName?: string;
  initialCustomerEmail?: string;
  initialCustomerPhone?: string;
  onCreated: (complaintId: number) => void;
};

function customerLabel(o: Pick<OrderLoaded | OrderLite, "first_name" | "last_name" | "city">): string {
  const n = [o.first_name?.trim(), o.last_name?.trim()].filter(Boolean).join(" ");
  if (n) return n;
  return "—";
}

export default function NewComplaintWizard({
  open,
  onClose,
  warehouseId,
  tenantId = DAMAGE_TENANT_ID,
  initialOrderId = null,
  initialOrderItemIds,
  initialCustomerName,
  initialCustomerEmail,
  initialCustomerPhone,
  onCreated,
}: NewComplaintWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [search, setSearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHits, setSearchHits] = useState<OrderLite[]>([]);
  const [order, setOrder] = useState<OrderLoaded | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [lines, setLines] = useState<Record<number, LineDraft>>({});
  const [form, setForm] = useState<ComplaintFormState>(() => ({ ...EMPTY_FORM }));
  const photoSeq = useRef(0);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setStep(1);
    setSearch("");
    setSearchHits([]);
    setOrder(null);
    setLines((prev) => {
      Object.values(prev).forEach((d) => d.photos.forEach((p) => URL.revokeObjectURL(p.url)));
      return {};
    });
    setForm({ ...EMPTY_FORM });
    setSubmitErr(null);
  }, []);

  useEffect(() => {
    if (!order) {
      setForm((prev) => ({
        ...prev,
        customer_name: "",
        customer_phone: "",
        customer_email: "",
      }));
      return;
    }
    const { phone, email } = contactFromAddressesJson(order.addresses_json);
    const customer_name = customerNameFromOrder(order);
    setForm((prev) => ({
      ...prev,
      customer_name,
      customer_phone: phone,
      customer_email: email,
    }));
  }, [order]);

  useEffect(() => {
    if (!open) return;
    reset();
    if (initialCustomerName || initialCustomerEmail || initialCustomerPhone) {
      setForm({
        ...EMPTY_FORM,
        customer_name: initialCustomerName?.trim() ?? "",
        customer_email: initialCustomerEmail?.trim() ?? "",
        customer_phone: initialCustomerPhone?.trim() ?? "",
      });
    }
    if (initialOrderId != null && initialOrderId > 0) {
      setStep(2);
      setOrderLoading(true);
      void api
        .get<OrderLoaded>(`/orders/${initialOrderId}/`)
        .then((res) => setOrder(res.data))
        .catch(() => setOrder(null))
        .finally(() => setOrderLoading(false));
    }
  }, [open, initialOrderId, initialCustomerName, initialCustomerEmail, initialCustomerPhone, reset]);

  const applyInitialItems = useCallback(
    (ord: OrderLoaded) => {
      if (!initialOrderItemIds?.length) return;
      const next: Record<number, LineDraft> = {};
      for (const iid of initialOrderItemIds) {
        const row = ord.items.find((x) => x.id === iid);
        if (!row) continue;
        next[iid] = {
          selected: true,
          qty: Math.min(Math.max(1, row.quantity), row.quantity),
          photos: [],
          defect_ids: [],
        };
      }
      if (Object.keys(next).length) setLines(next);
    },
    [initialOrderItemIds],
  );

  useEffect(() => {
    if (order && initialOrderItemIds?.length) applyInitialItems(order);
  }, [order, initialOrderItemIds, applyInitialItems]);

  useEffect(() => {
    if (!open || step !== 1 || warehouseId == null) return;
    const q = search.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    const t = setTimeout(() => {
      setSearchLoading(true);
      const params = new URLSearchParams({
        tenant_id: String(tenantId),
        warehouse_id: String(warehouseId),
        search: q,
        limit: "20",
        offset: "0",
        sort_by: "order_date",
        sort_dir: "desc",
      });
      void api
        .get<OrderLite[]>(`/orders/?${params.toString()}`)
        .then((res) => setSearchHits(Array.isArray(res.data) ? res.data : []))
        .catch(() => setSearchHits([]))
        .finally(() => setSearchLoading(false));
    }, 320);
    return () => clearTimeout(t);
  }, [open, step, search, tenantId, warehouseId]);

  const pickOrder = useCallback(async (oid: number) => {
    setOrderLoading(true);
    setSubmitErr(null);
    try {
      const res = await api.get<OrderLoaded>(`/orders/${oid}/`);
      setOrder(res.data);
      setLines((prev) => {
        Object.values(prev).forEach((d) => d.photos.forEach((p) => URL.revokeObjectURL(p.url)));
        return {};
      });
      setStep(2);
    } catch {
      setSubmitErr("Nie udało się wczytać zamówienia.");
    } finally {
      setOrderLoading(false);
    }
  }, []);

  const toggleLine = useCallback((itemId: number, row: OrderItemRow) => {
    setLines((prev) => {
      const cur = prev[itemId];
      if (cur?.selected) {
        cur.photos.forEach((p) => URL.revokeObjectURL(p.url));
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [itemId]: {
          selected: true,
          qty: Math.min(1, row.quantity),
          photos: [],
          defect_ids: [],
        },
      };
    });
  }, []);

  const toggleLineDefect = useCallback((itemId: number, defectId: string) => {
    setLines((prev) => {
      const cur = prev[itemId];
      if (!cur?.selected) return prev;
      const has = cur.defect_ids.includes(defectId);
      return {
        ...prev,
        [itemId]: {
          ...cur,
          defect_ids: has ? cur.defect_ids.filter((x) => x !== defectId) : [...cur.defect_ids, defectId],
        },
      };
    });
  }, []);

  const setLineQty = useCallback((itemId: number, maxQ: number, qty: number) => {
    const q = Math.max(1, Math.min(maxQ, Math.floor(qty) || 1));
    setLines((prev) =>
      prev[itemId]?.selected ? { ...prev, [itemId]: { ...prev[itemId], qty: q } } : prev,
    );
  }, []);

  const appendLinePhotos = useCallback((itemId: number, files: FileList | null) => {
    if (!files?.length) return;
    const cap = 5;
    const maxBytes = 5 * 1024 * 1024;
    setLines((prev) => {
      const cur = prev[itemId];
      if (!cur?.selected) return prev;
      const nextPhotos = [...cur.photos];
      for (let i = 0; i < files.length && nextPhotos.length < cap; i += 1) {
        const f = files[i];
        if (!f.type.startsWith("image/") || f.size > maxBytes) continue;
        photoSeq.current += 1;
        nextPhotos.push({ id: `p-${photoSeq.current}`, file: f, url: URL.createObjectURL(f) });
      }
      return { ...prev, [itemId]: { ...cur, photos: nextPhotos } };
    });
  }, []);

  const removeLinePhoto = useCallback((itemId: number, photoId: string) => {
    setLines((prev) => {
      const cur = prev[itemId];
      if (!cur?.selected) return prev;
      const slot = cur.photos.find((p) => p.id === photoId);
      if (slot) URL.revokeObjectURL(slot.url);
      return { ...prev, [itemId]: { ...cur, photos: cur.photos.filter((p) => p.id !== photoId) } };
    });
  }, []);

  const selectedLinesPayload = useMemo(() => {
    if (!order) return [];
    const out: { order_item_id: number; quantity: number; defect_ids?: string[] | null }[] = [];
    for (const it of order.items) {
      const d = lines[it.id];
      if (!d?.selected) continue;
      out.push({
        order_item_id: it.id,
        quantity: d.qty,
        defect_ids: d.defect_ids.length ? d.defect_ids : null,
      });
    }
    return out;
  }, [order, lines]);

  const linePhotosForSubmit = useMemo(() => {
    if (!order) return [];
    const groups: { order_item_id: number; files: File[] }[] = [];
    for (const it of order.items) {
      const d = lines[it.id];
      if (!d?.selected || !d.photos.length) continue;
      groups.push({ order_item_id: it.id, files: d.photos.map((p) => p.file) });
    }
    return groups;
  }, [order, lines]);

  const submit = useCallback(async () => {
    if (!order || selectedLinesPayload.length === 0) {
      setSubmitErr("Wybierz co najmniej jeden produkt.");
      return;
    }
    const noteTrim = form.note.trim() || null;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      if (import.meta.env.DEV) {
        console.log("[complaints] create payload", {
          order_id: order.id,
          lines: selectedLinesPayload,
          note: noteTrim,
          defect_ids: null,
        });
      }
      const created = await createComplaintFromOrder(
        {
          order_id: order.id,
          lines: selectedLinesPayload,
          note: noteTrim,
          photo_urls: null,
          defect_ids: null,
        },
        tenantId,
        warehouseId,
        { linePhotos: linePhotosForSubmit.length ? linePhotosForSubmit : null },
      );
      onCreated(created.id);
      onClose();
      reset();
    } catch (e: unknown) {
      let msg = "Nie udało się utworzyć reklamacji.";
      if (typeof e === "object" && e !== null && "response" in e) {
        const d = (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
        if (typeof d === "string") msg = d;
      }
      setSubmitErr(msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    form,
    linePhotosForSubmit,
    onClose,
    onCreated,
    order,
    reset,
    selectedLinesPayload,
    tenantId,
    warehouseId,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Nowa reklamacja</h2>
            <p className="text-xs text-gray-500">
              Krok {step} z 3 — powiązanie z zamówieniem
            </p>
          </div>
          <button type="button" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" onClick={onClose} aria-label="Zamknij">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Wyszukaj zamówienie (numer, ID lub produkt).</p>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Min. 2 znaki…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                autoFocus
              />
              {searchLoading && <p className="text-xs text-gray-500">Szukam…</p>}
              <ul className="max-h-60 space-y-1 overflow-y-auto">
                {searchHits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left text-sm hover:border-gray-200 hover:bg-white"
                      onClick={() => void pickOrder(h.id)}
                    >
                      <span className="font-medium text-gray-900">
                        #{h.number ?? h.id} · ID {h.id}
                      </span>
                      <span className="text-xs text-gray-600">{customerLabel(h)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {search.trim().length >= 2 && !searchLoading && searchHits.length === 0 && (
                <p className="text-sm text-amber-700">Brak wyników.</p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              {orderLoading || !order ? (
                <p className="text-sm text-gray-500">Ładowanie zamówienia…</p>
              ) : (
                <>
                  <div className="rounded-lg border border-gray-100 bg-slate-50 px-3 py-2 text-sm">
                    <div className="font-semibold text-gray-900">Zamówienie #{order.number ?? order.id}</div>
                    <div className="text-xs text-gray-600">
                      {[
                        form.customer_name || customerLabel(order),
                        [form.customer_phone, form.customer_email].filter(Boolean).join(" · ") || null,
                        order.source ?? "—",
                        order.value != null ? `${Number(order.value).toFixed(2)} ${order.currency ?? "PLN"}` : "—",
                      ]
                        .filter((x) => x != null && String(x).length > 0)
                        .join(" · ")}
                    </div>
                  </div>
                  <p className="text-xs font-medium text-gray-500">Wybierz produkty i ilości</p>
                  <ul className="space-y-2">
                    {order.items.map((it) => {
                      const d = lines[it.id];
                      const sel = !!d?.selected;
                      return (
                        <li key={it.id} className={`rounded-lg border px-3 py-2 ${sel ? "border-blue-300 bg-blue-50/40" : "border-gray-100"}`}>
                          <label className="flex cursor-pointer items-start gap-2">
                            <input
                              type="checkbox"
                              checked={sel}
                              onChange={() => toggleLine(it.id, it)}
                              className="mt-1 rounded text-blue-600"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-gray-900">{it.product?.name ?? "Produkt"}</div>
                              <div className="text-xs text-gray-500">
                                {it.product?.ean ?? "—"} · max {it.quantity} szt.
                                {it.unit_price != null ? ` · ${Number(it.unit_price).toFixed(2)} zł` : ""}
                              </div>
                              {sel ? (
                                <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label className="text-xs text-gray-600">
                                      Ilość
                                      <input
                                        type="number"
                                        min={1}
                                        max={it.quantity}
                                        value={d?.qty ?? 1}
                                        onChange={(e) => setLineQty(it.id, it.quantity, Number(e.target.value))}
                                        className="ml-1 w-16 rounded border border-gray-200 px-1 py-0.5 text-sm"
                                      />
                                    </label>
                                    <input
                                      id={`complaint-line-photo-${it.id}`}
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      capture="environment"
                                      className="sr-only"
                                      onChange={(e) => {
                                        appendLinePhotos(it.id, e.target.files);
                                        e.target.value = "";
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => document.getElementById(`complaint-line-photo-${it.id}`)?.click()}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50"
                                    >
                                      <Camera className="h-3.5 w-3.5 text-gray-600" aria-hidden />
                                      Dodaj zdjęcie
                                    </button>
                                  </div>
                                  {d?.photos?.length ? (
                                    <div className="flex flex-wrap gap-1.5">
                                      {d.photos.map((p) => (
                                        <div key={p.id} className="relative h-14 w-14 shrink-0">
                                          <img
                                            src={p.url}
                                            alt=""
                                            className="h-full w-full rounded-md border border-gray-200 object-cover"
                                          />
                                          <button
                                            type="button"
                                            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white text-[10px] font-bold text-gray-700 shadow hover:bg-red-50 hover:text-red-700"
                                            aria-label="Usuń zdjęcie"
                                            onClick={() => removeLinePhoto(it.id, p.id)}
                                          >
                                            ×
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}

          {step === 3 && order && (
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-100 bg-slate-50 px-3 py-2 text-xs text-gray-700">
                <strong>{selectedLinesPayload.length}</strong> poz. · zam. #{order.number ?? order.id}
              </div>
              <div className="space-y-2">
                <span className="text-sm text-gray-600">Wady / problemy per produkt (opcjonalnie)</span>
                <div className="space-y-2">
                  {(order.items ?? []).filter((it) => lines[it.id]?.selected).map((it) => {
                    const d = lines[it.id];
                    if (!d?.selected) return null;
                    return (
                      <div key={`defects-line-${it.id}`} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2">
                        <p className="mb-1 text-xs font-semibold text-gray-900">{it.product?.name ?? `Produkt #${it.id}`}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {COMPLAINT_DEFECT_TAG_OPTIONS.map((t) => {
                            const on = d.defect_ids.includes(t.id);
                            return (
                              <button
                                key={`${it.id}-${t.id}`}
                                type="button"
                                onClick={() => toggleLineDefect(it.id, t.id)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                  on
                                    ? "border-blue-400 bg-blue-50 text-blue-900"
                                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                }`}
                              >
                                {t.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <label className="block text-sm">
                <span className="text-gray-600">Notatka (opcjonalnie)</span>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}
          {submitErr ? <p className="text-sm text-red-600">{submitErr}</p> : null}
        </div>

        <div className="flex flex-wrap justify-between gap-2 border-t border-gray-100 px-4 py-3">
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => {
              if (step === 1) onClose();
              else if (step === 2) {
                if (initialOrderId) onClose();
                else {
                  setStep(1);
                  setOrder(null);
                  setLines((prev) => {
                    Object.values(prev).forEach((d) => d.photos.forEach((p) => URL.revokeObjectURL(p.url)));
                    return {};
                  });
                }
              } else setStep(2);
            }}
          >
            {step === 1 ? "Anuluj" : "Wstecz"}
          </button>
          <div className="flex gap-2">
            {step === 2 && order && (
              <button
                type="button"
                disabled={selectedLinesPayload.length === 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() => setStep(3)}
              >
                Dalej
              </button>
            )}
            {step === 3 && (
              <button
                type="button"
                disabled={submitting}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                onClick={() => void submit()}
              >
                {submitting ? "Tworzę…" : "Utwórz reklamację"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
