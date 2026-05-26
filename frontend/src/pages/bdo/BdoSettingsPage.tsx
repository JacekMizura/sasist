import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/axios";
import { getBdoSettings, putBdoSettings, type BdoSettings } from "../../api/bdoPackagingApi";

type Tenant = { id: number; name: string };

export default function BdoSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(1);
  const [s, setS] = useState<BdoSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<Tenant[]>("/tenants/")
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setTenants(list);
        const tid = searchParams.get("tenant_id");
        if (tid != null && tid !== "") {
          const n = Number(tid);
          if (Number.isFinite(n) && n >= 1) setTenantId(n);
        }
      })
      .catch(() => setTenants([]));
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setS(await getBdoSettings(tenantId));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const next = await putBdoSettings(tenantId, {
        reporting_company_name: s.reporting_company_name,
        registration_numbers: s.registration_numbers,
        default_methodology_text: s.default_methodology_text,
        allow_negative_stock: s.allow_negative_stock,
      });
      setS(next);
      window.alert("Zapisano.");
    } catch {
      window.alert("Zapis nie powiódł się.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tenantId}
          onChange={(e) => {
            const v = Number(e.target.value);
            setTenantId(v);
            setSearchParams({ tenant_id: String(v) }, { replace: true });
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {loading || !s ? (
        <p className="text-slate-500">Ładowanie…</p>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm">
          <div>
            <label className="text-xs font-semibold text-slate-500">Nazwa firmy raportującej</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={s.reporting_company_name ?? ""}
              onChange={(e) => setS({ ...s, reporting_company_name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Numery rejestrowe</label>
            <textarea
              className="mt-1 min-h-[80px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={s.registration_numbers ?? ""}
              onChange={(e) => setS({ ...s, registration_numbers: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Domyślny opis metodyki</label>
            <textarea
              className="mt-1 min-h-[100px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={s.default_methodology_text ?? ""}
              onChange={(e) => setS({ ...s, default_methodology_text: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.allow_negative_stock}
              onChange={(e) => setS({ ...s, allow_negative_stock: e.target.checked })}
            />
            Zezwalaj na ujemny stan z księgi w podglądzie
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? "Zapisywanie…" : "Zapisz ustawienia"}
          </button>
        </div>
      )}
    </div>
  );
}
