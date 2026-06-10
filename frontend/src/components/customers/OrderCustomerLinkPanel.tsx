import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, UserPlus, Users } from "lucide-react";

import {
  createCustomerFromOrder,
  linkOrderToCustomer,
  previewOrderCustomerLink,
  type CustomerDuplicateCandidate,
  type OrderCustomerLinkPreview,
} from "../../api/customerOrderLinkApi";
import { listCustomers, type CustomerListRow } from "../../api/customersApi";
import { PanelBulkStatusConfirmModal } from "../orders/panelList/PanelBulkStatusConfirmModal";
import { getCustomerDisplayName } from "../../utils/getCustomerDisplayName";

type Props = {
  orderId: number;
  tenantId: number;
  customerId?: number | null;
  hasContactData: boolean;
  onLinked: (customerId: number, displayName: string) => void;
};

export function OrderCustomerLinkPanel({
  orderId,
  tenantId,
  customerId,
  hasContactData,
  onLinked,
}: Props) {
  const [preview, setPreview] = useState<OrderCustomerLinkPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dupModalOpen, setDupModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CustomerListRow[]>([]);

  const loadPreview = useCallback(async () => {
    if (customerId || !hasContactData) return;
    setLoading(true);
    setErr(null);
    try {
      const p = await previewOrderCustomerLink(tenantId, orderId);
      setPreview(p);
    } catch {
      setErr("Nie udało się przygotować danych klienta.");
    } finally {
      setLoading(false);
    }
  }, [customerId, hasContactData, orderId, tenantId]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    if (!linkModalOpen || search.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      void listCustomers({ tenant_id: tenantId, search: search.trim() })
        .then((rows) => setResults(rows.slice(0, 8)))
        .catch(() => setResults([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [linkModalOpen, search, tenantId]);

  if (customerId) return null;
  if (!hasContactData) return null;

  const duplicates = preview?.duplicates ?? [];

  const handleCreate = async (force = false) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await createCustomerFromOrder(tenantId, orderId, force);
      onLinked(res.customer_id, res.display_name);
      setDupModalOpen(false);
    } catch (e: unknown) {
      const detail = (e as { response?: { status?: number; data?: { detail?: string } } }).response;
      if (detail?.status === 409 && !force) {
        setDupModalOpen(true);
        return;
      }
      setErr(detail?.data?.detail ?? "Nie udało się utworzyć klienta.");
    } finally {
      setBusy(false);
    }
  };

  const handleLink = async (id: number) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await linkOrderToCustomer(tenantId, orderId, id);
      onLinked(res.customer_id, res.display_name);
      setLinkModalOpen(false);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setErr(detail ?? "Nie udało się połączyć klienta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
            Klient niezapisany
          </span>
          {loading ? (
            <span className="inline-flex items-center gap-1 text-xs text-slate-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Analiza danych…
            </span>
          ) : null}
        </div>
        {preview?.draft ? (
          <p className="text-xs text-slate-700">
            {getCustomerDisplayName({
              company_name: preview.draft.company_name,
              first_name: preview.draft.first_name,
              last_name: preview.draft.last_name,
              email: preview.draft.email,
            })}
            {preview.draft.nip ? ` · NIP ${preview.draft.nip}` : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => void handleCreate(false)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Dodaj do klientów
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setLinkModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            Połącz z istniejącym
          </button>
        </div>
        {err ? <p className="text-xs text-red-700">{err}</p> : null}
      </div>

      <PanelBulkStatusConfirmModal
        open={dupModalOpen}
        title="Możliwe duplikaty klienta"
        message="W systemie są rekordy pasujące do danych z zamówienia."
        subMessage={duplicates
          .slice(0, 3)
          .map((d: CustomerDuplicateCandidate) => `${d.display_name} (${d.match_reasons.join(", ")})`)
          .join(" · ")}
        confirmLabel="Utwórz mimo to"
        cancelLabel="Anuluj"
        busy={busy}
        onCancel={() => setDupModalOpen(false)}
        onConfirm={() => void handleCreate(true)}
      />

      {linkModalOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onClick={() => {
            if (!busy) setLinkModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg"
            role="dialog"
            aria-labelledby="link-customer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="link-customer-title" className="text-sm font-bold text-slate-900">
              Połącz z istniejącym klientem
            </h3>
            <input
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Szukaj klienta…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <ul className="mt-2 max-h-48 overflow-y-auto">
              {results.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleLink(row.id)}
                    className="w-full px-2 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="font-medium text-slate-900">{getCustomerDisplayName(row)}</span>
                    <span className="block text-xs text-slate-500">
                      {[row.email, row.phone, row.nip].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {duplicates.length ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-600">Sugerowane dopasowania</p>
                <ul className="mt-1 space-y-1">
                  {duplicates.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleLink(d.id)}
                        className="text-sm font-medium text-blue-700 hover:underline disabled:opacity-50"
                      >
                        {d.display_name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => setLinkModalOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
