import { Link } from "react-router-dom";
import { Key, Plug } from "lucide-react";

import PageLayout from "../../../components/layout/PageLayout";
import { PageHeader } from "../../../components/layout/PageHeader";

/**
 * Hub Integracje — konfiguracja połączeń z zewnętrznymi systemami.
 * Klucze API / tokeny są osobnym obszarem administracyjnym (`/settings/api-keys`).
 */
export default function IntegrationsSettingsPage() {
  return (
    <PageLayout>
      <PageHeader
        title="Integracje"
        description="Połączenia z zewnętrznymi systemami i usługami (kanały sprzedaży, kurierzy, webhooks)."
        icon={Plug}
        breadcrumbs={[
          { label: "Ustawienia", to: "/settings/company" },
          { label: "Integracje" },
        ]}
      />

      <div className="mt-4 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">
            Ten obszar służy do konfiguracji integracji biznesowych. Dostęp techniczny (klucze API, Printer Agent,
            scope, IP) zarządzasz osobno w module{" "}
            <Link to="/settings/api-keys" className="font-semibold text-orange-600 hover:underline">
              Klucze API
            </Link>
            .
          </p>
        </div>

        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
          <Plug className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
          <p className="mt-3 text-sm font-semibold text-slate-800">Brak aktywnych kart integracji w tym widoku</p>
          <p className="mt-1 text-xs text-slate-500">
            Konfiguratory konkretnych integracji pojawią się tutaj w miarę wdrożenia — bez łączenia z zarządzaniem
            kluczami API.
          </p>
          <Link
            to="/settings/api-keys"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Key className="h-4 w-4" aria-hidden />
            Przejdź do Klucze API
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}
