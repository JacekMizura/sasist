import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Clock,
  Mail,
  Paperclip,
  Phone,
  Search,
  Sparkles,
  User,
} from "lucide-react";

import { patchOrder, type OrderNoteDto } from "../../api/ordersApi";
import {
  fetchCustomerPurchaseDocuments,
  fetchCustomerPurchaseSummary,
  type PurchaseHistoryDocumentRow,
  type PurchaseHistorySummary,
} from "../../api/customerPurchaseHistoryApi";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import type { OrderDetail } from "./orderDetailPageTypes";
import type { OrderOperationalNoteDto } from "../../api/ordersApi";

type Channel = "email" | "sms" | "sms_sa_call";
type NotesFilter = "all" | "picking" | "packing";

const CARD =
  "rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm";
const MICRO =
  "text-[10px] font-bold uppercase tracking-widest text-slate-400";
const SECTION_TITLE = "text-[13px] font-bold tracking-tight text-slate-900";
const ICON = "h-3.5 w-3.5 shrink-0 text-slate-400";

const MESSAGE_TEMPLATES: { id: string; label: string; body: string }[] = [
  {
    id: "order_confirmation",
    label: "Potwierdzenie zamówienia",
    body: "Dziękujemy za złożenie zamówienia. Potwierdzamy przyjęcie i przekażemy dalsze informacje o realizacji.",
  },
  {
    id: "payment_reminder",
    label: "Przypomnienie o płatności",
    body: "Przypominamy o oczekującej płatności za zamówienie. Po zaksięgowaniu środków niezwłocznie przekażemy je do realizacji.",
  },
  {
    id: "order_shipped",
    label: "Wysłane",
    body: "Informujemy, że zamówienie zostało nadane. Numer śledzenia prześlemy w osobnej wiadomości.",
  },
  {
    id: "pickup_ready",
    label: "Gotowe do odbioru",
    body: "Zamówienie jest gotowe do odbioru. Zapraszamy w godzinach otwarcia punktu.",
  },
];

function readCustomerLogin(addressesJson: string | null | undefined): string {
  if (!addressesJson?.trim()) return "";
  try {
    const root = JSON.parse(addressesJson) as Record<string, unknown>;
    const bill = root.billing as Record<string, unknown> | undefined;
    const ship = (root.shipping ?? root.delivery) as Record<string, unknown> | undefined;
    const fromBill = bill && typeof bill === "object" ? String(bill.login ?? bill.username ?? "").trim() : "";
    if (fromBill) return fromBill;
    const fromShip = ship && typeof ship === "object" ? String(ship.login ?? ship.username ?? "").trim() : "";
    return fromShip;
  } catch {
    return "";
  }
}

function isCustomerNote(type: string): boolean {
  const t = type.trim().toLowerCase();
  return t === "customer" || t === "client" || t.includes("customer") || t.includes("klient");
}

export type OrderDetailCommsTabProps = {
  order: OrderDetail;
  contact: { name: string; phone: string; email: string };
  orderNotes: OrderNoteDto[];
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  opDraft: string;
  setOpDraft: (v: string) => void;
  opVisPick: boolean;
  setOpVisPick: (v: boolean) => void;
  opVisPack: boolean;
  setOpVisPack: (v: boolean) => void;
  opSaving: boolean;
  saveOperationalNote: () => void | Promise<void>;
  formatDetailDate: (iso: string | null | undefined) => string;
  formatMoney: (value: number | null | undefined, currency: string | null | undefined) => string;
  customerComment: string;
  onReloadOrder: () => void | Promise<void>;
  onReloadNotes: () => void | Promise<void>;
  tenantId: number;
};

/**
 * Zakładka Komunikacja — polish UX 8/4 (compose + historia | AI + klient + notatki).
 * Bez zmian API / logiki wysyłki.
 */
export function OrderDetailCommsTab({
  order,
  contact,
  orderNotes,
  noteDraft,
  setNoteDraft,
  opDraft,
  setOpDraft,
  opVisPick,
  setOpVisPick,
  opVisPack,
  setOpVisPack,
  opSaving,
  saveOperationalNote,
  formatDetailDate,
  formatMoney,
  customerComment,
  onReloadOrder,
  onReloadNotes,
  tenantId,
}: OrderDetailCommsTabProps) {
  const [channel, setChannel] = useState<Channel>("email");
  const [templateId, setTemplateId] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [notesFilter, setNotesFilter] = useState<NotesFilter>("all");
  const [attachNames, setAttachNames] = useState<string[]>([]);
  const [customerNoteDraft, setCustomerNoteDraft] = useState("");
  const [customerNoteSaving, setCustomerNoteSaving] = useState(false);
  const [purchaseSummary, setPurchaseSummary] = useState<PurchaseHistorySummary | null>(null);
  const [purchaseDocs, setPurchaseDocs] = useState<PurchaseHistoryDocumentRow[]>([]);

  const login = useMemo(() => readCustomerLogin(order.addresses_json), [order.addresses_json]);
  const customerId = order.customer_id ?? order.customer?.id ?? null;
  const operationalNotes = order.operational_notes ?? [];

  useEffect(() => {
    if (customerId == null || customerId <= 0 || tenantId <= 0) {
      setPurchaseSummary(null);
      setPurchaseDocs([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      fetchCustomerPurchaseSummary(customerId, tenantId),
      fetchCustomerPurchaseDocuments(customerId, tenantId, {}, { page: 1, page_size: 5 }),
    ])
      .then(([sum, docs]) => {
        if (cancelled) return;
        setPurchaseSummary(sum);
        setPurchaseDocs(docs.items ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setPurchaseSummary(null);
        setPurchaseDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, tenantId]);

  const sortedNotes = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    const rows = [...orderNotes].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
    if (!q) return rows;
    return rows.filter(
      (n) =>
        n.content.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        (n.created_at ?? "").toLowerCase().includes(q),
    );
  }, [orderNotes, historyQuery]);

  const latestAt = sortedNotes[0]?.created_at ?? null;
  const oldestShown = sortedNotes.length > 0 ? sortedNotes[sortedNotes.length - 1]?.created_at : null;

  const filteredOpNotes = useMemo(() => {
    if (notesFilter === "picking") return operationalNotes.filter((n) => n.show_in_picking);
    if (notesFilter === "packing") return operationalNotes.filter((n) => n.show_in_packing);
    return operationalNotes;
  }, [operationalNotes, notesFilter]);

  const aiBlurb = useMemo(() => {
    const parts: string[] = [];
    if (contact.name && contact.name !== "—") parts.push(`Klient: ${contact.name}.`);
    if (purchaseSummary?.order_count != null) {
      parts.push(
        `Historia: ${purchaseSummary.order_count} zamówień (${formatMoney(purchaseSummary.total_gross, order.currency)}).`,
      );
    } else if (order.value != null) {
      parts.push(`Wartość bieżącego zamówienia: ${formatMoney(order.value, order.currency)}.`);
    }
    if (customerComment.trim()) {
      parts.push(`Aktualny komentarz klienta: „${customerComment.trim()}”.`);
    } else if (sortedNotes[0]?.content) {
      parts.push(`Ostatni wpis korespondencji: „${sortedNotes[0].content.trim().slice(0, 140)}${sortedNotes[0].content.length > 140 ? "…" : ""}”.`);
    } else {
      parts.push("Brak dodatkowych sygnałów w korespondencji.");
    }
    return parts.join(" ");
  }, [contact.name, purchaseSummary, order.currency, order.value, customerComment, sortedNotes, formatMoney]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = MESSAGE_TEMPLATES.find((x) => x.id === id);
    if (t) setNoteDraft(t.body);
  };

  const applyAiSuggestion = () => {
    const channelLabel =
      channel === "email" ? "e-mail" : channel === "sms" ? "SMS" : "SMS SA CALL";
    const base =
      `Dzień dobry${contact.name !== "—" ? ` ${contact.name}` : ""},\n\n` +
      `dziękujemy za kontakt w sprawie zamówienia #${order.number?.trim() || order.id}. ` +
      `Odpowiadamy na ${channelLabel}: sprawdzamy sprawę i wrócimy z informacją.\n\n` +
      `Pozdrawiamy`;
    setNoteDraft(base);
  };

  const saveCustomerNote = async () => {
    const text = customerNoteDraft.trim();
    if (!text || !order.id) return;
    setCustomerNoteSaving(true);
    try {
      await patchOrder(order.id, { customer_note_append: text });
      setCustomerNoteDraft("");
      await onReloadOrder();
      await onReloadNotes();
    } catch {
      window.alert("Nie udało się zapisać notatki o kliencie.");
    } finally {
      setCustomerNoteSaving(false);
    }
  };

  const channelBtn = (id: Channel, label: string) => {
    const active = channel === id;
    return (
      <button
        type="button"
        onClick={() => setChannel(id)}
        className={`rounded-md border px-2.5 py-1 text-xs font-bold transition-colors ${
          active
            ? "border-blue-300 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        }`}
      >
        {active ? "✓ " : ""}
        {label}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
      <div className="min-w-0 space-y-3.5 lg:col-span-8">
        {/* NOWA WIADOMOŚĆ */}
        <section className={CARD}>
          <h3 className={`${MICRO} mb-2.5`}>Nowa wiadomość</h3>
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            {channelBtn("email", "E-mail")}
            {channelBtn("sms", "SMS")}
            {channelBtn("sms_sa_call", "SMS SA CALL")}
            <label className="ml-auto inline-flex min-w-[10rem] items-center gap-1.5">
              <span className="sr-only">Szablon wiadomości</span>
              <select
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">Szablon wiadomości</option>
                {MESSAGE_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="relative">
            <textarea
              id="order-comms-note"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={7}
              placeholder="Wpisz treść wiadomości..."
              className="min-h-[9.5rem] w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2.5 pb-10 text-[13px] leading-relaxed text-slate-900 outline-none transition-colors focus:border-orange-400"
            />
            <button
              type="button"
              onClick={applyAiSuggestion}
              className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Sugestia AI
            </button>
          </div>

          {attachNames.length > 0 ? (
            <p className="mt-1.5 truncate text-[11px] text-slate-500" title={attachNames.join(", ")}>
              Załączniki: {attachNames.join(", ")}
            </p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50">
              <Paperclip className={ICON} strokeWidth={2} aria-hidden />
              Dodaj załącznik
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setAttachNames(files.map((f) => f.name));
                }}
              />
            </label>
            <button type="button" className={brandPrimaryButtonClass}>
              Wyślij
            </button>
          </div>
        </section>

        {/* HISTORIA KORESPONDENCJI */}
        <section className={CARD}>
          <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className={SECTION_TITLE}>Historia korespondencji</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {latestAt || oldestShown
                  ? `(${formatDetailDate(oldestShown)} – ${formatDetailDate(latestAt)})`
                  : "Brak wpisów"}
              </p>
            </div>
            <label className="relative block">
              <Search className={`pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 ${ICON}`} strokeWidth={2} />
              <input
                type="search"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="Szukaj..."
                className="w-40 rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400"
              />
            </label>
          </div>

          {sortedNotes.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-slate-400">Brak historii korespondencji.</p>
          ) : (
            <ul className="space-y-2.5">
              {sortedNotes.map((n, idx) => {
                const fromCustomer = isCustomerNote(n.type);
                const newest = idx === 0;
                return (
                  <li
                    key={n.id}
                    className={`rounded-md border border-slate-200/80 px-3 py-2.5 ${
                      fromCustomer
                        ? "border-l-[3px] border-l-blue-500 bg-white"
                        : "border-l-[3px] border-l-emerald-500 bg-emerald-50/40"
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-slate-500">{formatDetailDate(n.created_at ?? null)}</span>
                      <span className="text-[12px] font-bold text-slate-900">
                        {fromCustomer ? contact.name !== "—" ? contact.name : "Klient" : "Sklep"}
                      </span>
                      {newest ? (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                          Najnowsza wiadomość
                        </span>
                      ) : null}
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] leading-snug text-slate-800">{n.content}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-3.5 lg:sticky lg:top-3 lg:col-span-4">
        {/* NOTATKA AI */}
        <section className={CARD}>
          <div className="mb-1.5 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-blue-600" strokeWidth={2} aria-hidden />
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-blue-700">Notatka AI</h3>
          </div>
          <p className="text-[12px] leading-snug text-slate-700">{aiBlurb}</p>
        </section>

        {/* KLIENT */}
        <section className={CARD}>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h3 className={SECTION_TITLE}>Klient</h3>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              Brak sygnałów ryzyka
            </span>
          </div>

          <div className="space-y-1.5 text-[13px]">
            <p className="text-base font-bold text-slate-900">{contact.name}</p>
            {login ? (
              <p className="flex items-center gap-1.5 text-slate-600">
                <User className={ICON} strokeWidth={2} aria-hidden />
                <span className="truncate">{login}</span>
              </p>
            ) : null}
            <p className="flex items-center gap-1.5 text-slate-600">
              <Phone className={ICON} strokeWidth={2} aria-hidden />
              {contact.phone}
            </p>
            <p className="flex items-center gap-1.5 text-slate-600">
              <Mail className={ICON} strokeWidth={2} aria-hidden />
              <span className="break-all">{contact.email}</span>
            </p>
            {customerId != null ? (
              <Link
                to={`/customers/${customerId}`}
                className="inline-block text-[12px] font-semibold text-blue-700 hover:underline"
              >
                Profil klienta →
              </Link>
            ) : null}
          </div>

          <div className="mt-3 border-t border-slate-100 pt-2.5">
            <p className={`${MICRO} mb-1.5`}>Zamówienia</p>
            <p className="mb-2 text-[12px] font-semibold text-slate-800">
              Zamówienia:{" "}
              {purchaseSummary
                ? `${purchaseSummary.order_count} (${formatMoney(purchaseSummary.total_gross, order.currency)})`
                : `1 (${formatMoney(order.value, order.currency)})`}
            </p>
            <ul className="space-y-1.5">
              {purchaseDocs.length > 0 ? (
                purchaseDocs.map((row) => (
                  <li key={row.order_id} className="flex items-center justify-between gap-2 text-[12px]">
                    <Link to={row.detail_path || `/orders/${row.order_id}`} className="font-bold text-slate-900 hover:underline">
                      #{row.document_number || row.order_id}
                    </Link>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{
                        backgroundColor: `${row.status?.color || "#e2e8f0"}22`,
                        color: row.status?.color || "#334155",
                      }}
                    >
                      {row.status?.name || "—"}
                    </span>
                    <span className="tabular-nums text-slate-600">{formatMoney(row.gross, order.currency)}</span>
                  </li>
                ))
              ) : (
                <li className="flex items-center justify-between gap-2 text-[12px]">
                  <Link to={`/orders/${order.id}`} className="font-bold text-slate-900 hover:underline">
                    #{order.number?.trim() || order.id}
                  </Link>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                    {order.order_ui_status?.name ?? order.status ?? "—"}
                  </span>
                  <span className="tabular-nums text-slate-600">{formatMoney(order.value, order.currency)}</span>
                </li>
              )}
            </ul>
          </div>

          {(order.latest_internal_note_preview || sortedNotes.find((n) => !isCustomerNote(n.type))) && (
            <div className="mt-3 border-t border-slate-100 pt-2.5">
              <p className="text-[12px] leading-snug text-slate-700">
                {(order.latest_internal_note_preview ??
                  sortedNotes.find((n) => !isCustomerNote(n.type))?.content ??
                  "").trim()}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
                  {formatDetailDate(
                    sortedNotes.find((n) => !isCustomerNote(n.type))?.created_at ?? null,
                  )}
                </span>
              </div>
            </div>
          )}

          <div className="mt-2.5 space-y-1.5">
            <textarea
              value={customerNoteDraft}
              onChange={(e) => setCustomerNoteDraft(e.target.value)}
              rows={2}
              placeholder="Notatka o kliencie..."
              className="w-full resize-y rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-orange-400"
            />
            <button
              type="button"
              disabled={customerNoteSaving || !customerNoteDraft.trim()}
              onClick={() => void saveCustomerNote()}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Dodaj notatkę o kliencie
            </button>
          </div>
        </section>

        {/* NOTATKI I KOMENTARZ */}
        <section className={CARD}>
          <h3 className={`${SECTION_TITLE} mb-2.5`}>Notatki i komentarz</h3>

          <div className="mb-3">
            <p className={`${MICRO} mb-1`}>Komentarz klienta</p>
            <div className="rounded-md border border-[#f5e08b] bg-[#fff9c4] px-2.5 py-2 text-[12px] leading-snug text-yellow-950">
              {customerComment.trim() || "Brak komentarza klienta."}
            </div>
          </div>

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className={MICRO}>Notatki</p>
            <select
              value={notesFilter}
              onChange={(e) => setNotesFilter(e.target.value as NotesFilter)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 outline-none"
            >
              <option value="all">Wszystkie</option>
              <option value="picking">Zbieranie</option>
              <option value="packing">Pakowanie</option>
            </select>
          </div>

          <div className="mb-2.5 max-h-48 space-y-2 overflow-y-auto">
            {filteredOpNotes.length === 0 ? (
              <p className="text-[12px] text-slate-400">Brak notatek operacyjnych.</p>
            ) : (
              filteredOpNotes.map((n: OrderOperationalNoteDto) => (
                <div key={n.id} className="rounded-md border border-slate-100 bg-slate-50/50 px-2 py-1.5">
                  <p className="whitespace-pre-wrap text-[12px] text-slate-900">{n.content}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                    <span>{formatDetailDate(n.created_at ?? null)}</span>
                    {n.show_in_picking ? (
                      <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 font-semibold">
                        WMS Zbieranie
                      </span>
                    ) : null}
                    {n.show_in_packing ? (
                      <span className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 font-semibold">
                        WMS Pakowanie
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>

          <textarea
            value={opDraft}
            onChange={(e) => setOpDraft(e.target.value)}
            rows={3}
            placeholder="Dodaj notatkę do zamówienia"
            className="mb-2 w-full resize-y rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[13px] outline-none focus:border-orange-400"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-3 text-xs text-slate-600">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                  checked={opVisPick}
                  onChange={(e) => setOpVisPick(e.target.checked)}
                />
                Zbieranie
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                  checked={opVisPack}
                  onChange={(e) => setOpVisPack(e.target.checked)}
                />
                Pakowanie
              </label>
            </div>
            <button
              type="button"
              disabled={opSaving || !opDraft.trim()}
              onClick={() => void saveOperationalNote()}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Dodaj notatkę
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}
