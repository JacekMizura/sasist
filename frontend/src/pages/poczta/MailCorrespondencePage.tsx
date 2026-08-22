import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox, Mail } from "lucide-react";

import { AppEmptyState } from "../../components/app-shell";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { usePocztaModuleContext } from "../../modules/poczta/context/PocztaModuleContext";
import { fetchMailSetupStatus, type MailSetupStatus } from "../../modules/poczta/services/mailApi";

export default function MailCorrespondencePage() {
  const { tenantId, refreshSignal } = usePocztaModuleContext();
  const [status, setStatus] = useState<MailSetupStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchMailSetupStatus(tenantId)
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, refreshSignal]);

  if (loading) {
    return <p className="text-sm text-slate-500">Ładowanie…</p>;
  }

  if (!status?.has_accounts) {
    return (
      <AppEmptyState
        icon={Mail}
        title="Poczta"
        description="Nie masz skonfigurowanego konta pocztowego."
        action={
          <Link to={`/poczta/konta?tenant_id=${tenantId}`} className={brandPrimaryButtonClass}>
            Dodaj konto pocztowe
          </Link>
        }
      />
    );
  }

  if (!status.has_conversations) {
    return (
      <AppEmptyState
        icon={Inbox}
        title="Brak korespondencji"
        description="Gdy skrzynka zostanie zsynchronizowana, rozmowy pojawią się tutaj."
      />
    );
  }

  return (
    <AppEmptyState
      icon={Inbox}
      title="Korespondencja"
      description="Lista rozmów będzie dostępna w kolejnej fazie modułu Poczta."
    />
  );
}
