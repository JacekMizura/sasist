import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchCustomerActivity, type CustomerActivityItem } from "../../api/customerCrmApi";
import { getCustomer } from "../../api/customersApi";
import { getCustomerDisplayName } from "../../utils/getCustomerDisplayName";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { CustomerDetailPageShell } from "./CustomerDetailPageShell";

const EVENT_BADGE: Record<string, string> = {
  ORDER: "bg-sky-50 text-sky-800 ring-sky-200",
  NOTE: "bg-violet-50 text-violet-800 ring-violet-200",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pl-PL");
}

export default function CustomerActivityPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const customerId = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;
  const tenantId = DAMAGE_TENANT_ID;
  const [title, setTitle] = useState("Klient");
  const [items, setItems] = useState<CustomerActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (customerId == null) return;
    void getCustomer(customerId, tenantId)
      .then((c) => setTitle(getCustomerDisplayName(c)))
      .catch(() => setTitle(getCustomerDisplayName({ id: customerId })));
  }, [customerId, tenantId]);

  useEffect(() => {
    if (customerId == null) return;
    setLoading(true);
    void fetchCustomerActivity(customerId, tenantId)
      .then(setItems)
      .catch(() => setErr("Nie udało się wczytać aktywności."))
      .finally(() => setLoading(false));
  }, [customerId, tenantId]);

  if (customerId == null) {
    return (
      <CustomerDetailPageShell customerId={null} title="Klient" sectionLabel="Aktywność">
        <p className="text-sm text-red-700">Nieprawidłowy identyfikator klienta.</p>
      </CustomerDetailPageShell>
    );
  }

  return (
    <CustomerDetailPageShell
      customerId={customerId}
      title={title}
      sectionLabel="Aktywność"
      showTabs
    >
      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{err}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie aktywności…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-slate-200/90 bg-white px-4 py-3 text-sm text-slate-600">
          Brak zdarzeń do wyświetlenia.
        </p>
      ) : (
        <ol className="relative space-y-0 border-l border-slate-200 pl-6">
          {items.map((item) => (
            <li key={item.id} className="relative pb-6 last:pb-0">
              <span className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full border-2 border-white bg-blue-500 ring-1 ring-slate-200" />
              <div className="rounded-lg border border-slate-200/90 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                      EVENT_BADGE[item.event_type] ?? "bg-slate-50 text-slate-700 ring-slate-200"
                    }`}
                  >
                    {item.event_label}
                  </span>
                  <time className="text-xs text-slate-500">{fmtDate(item.occurred_at)}</time>
                  {item.operator_name ? (
                    <span className="text-xs text-slate-500">· {item.operator_name}</span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-slate-800">
                  {item.detail_path ? (
                    <Link to={item.detail_path} className="font-medium text-blue-700 hover:underline">
                      {item.summary}
                    </Link>
                  ) : (
                    item.summary
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </CustomerDetailPageShell>
  );
}
