import { useCallback, useEffect, useState } from "react";
import { getBdoSettings, putBdoSettings, type BdoSettings } from "../../api/bdoPackagingApi";
import { AppButton, AppCard, AppSection } from "../../components/app-shell";
import { PurchasingFilterField, purchasingInputClass } from "../../modules/purchasing/ui";
import { BdoFilterBar } from "./components/BdoFilterBar";
import { useBdoTenant } from "./hooks/useBdoTenant";

export default function BdoSettingsPage() {
  const { tenants, tenantId, setTenantId } = useBdoTenant();
  const [s, setS] = useState<BdoSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    <div className="space-y-5 pb-8">
      <BdoFilterBar tenants={tenants} tenantId={tenantId} onTenantChange={setTenantId} />

      {loading || !s ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : (
        <div className="max-w-4xl">
          <AppCard>
            <AppSection title="Dane raportującego">
              <PurchasingFilterField label="Nazwa firmy raportującej">
                <input
                  className={purchasingInputClass}
                  value={s.reporting_company_name ?? ""}
                  onChange={(e) => setS({ ...s, reporting_company_name: e.target.value })}
                />
              </PurchasingFilterField>
              <PurchasingFilterField label="Numery rejestrowe">
                <textarea
                  className={`${purchasingInputClass} min-h-[80px]`}
                  value={s.registration_numbers ?? ""}
                  onChange={(e) => setS({ ...s, registration_numbers: e.target.value })}
                />
              </PurchasingFilterField>
            </AppSection>

            <AppSection title="Metodyka obliczeń" className="mt-4 border-t border-slate-100 pt-4">
              <PurchasingFilterField label="Domyślny opis metodyki">
                <textarea
                  className={`${purchasingInputClass} min-h-[100px]`}
                  value={s.default_methodology_text ?? ""}
                  onChange={(e) => setS({ ...s, default_methodology_text: e.target.value })}
                />
              </PurchasingFilterField>
            </AppSection>

            <AppSection title="Opcje księgi" className="mt-4 border-t border-slate-100 pt-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={s.allow_negative_stock}
                  onChange={(e) => setS({ ...s, allow_negative_stock: e.target.checked })}
                />
                Zezwalaj na ujemny stan z księgi w podglądzie
              </label>
            </AppSection>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <AppButton variant="primary" disabled={saving} onClick={() => void save()}>
                {saving ? "Zapisywanie…" : "Zapisz ustawienia"}
              </AppButton>
            </div>
          </AppCard>
        </div>
      )}
    </div>
  );
}
