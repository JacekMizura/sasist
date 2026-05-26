import { useEffect, useState } from "react";
import { getSystemHealth, getDbSize } from "../../api/systemApi";
import PageLayout from "../../components/layout/PageLayout";
import { PageHeader } from "../../components/layout/PageHeader";

export default function SystemHealth() {
  const [health, setHealth] = useState<{ status: string; service?: string } | null>(null);
  const [dbSize, setDbSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getSystemHealth(), getDbSize()])
      .then(([h, d]) => {
        if (cancelled) return;
        setHealth(h);
        const size = (d as { database_size_mb?: number; size_mb?: number }).database_size_mb
          ?? (d as { database_size_mb?: number; size_mb?: number }).size_mb ?? 0;
        setDbSize(size);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Błąd połączenia z backendem");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <PageLayout>
        <PageHeader title="Zdrowie systemu" />
        <p className="text-slate-500">Ładowanie…</p>
      </PageLayout>
    );
  }
  if (error) {
    return (
      <PageLayout>
        <PageHeader title="Zdrowie systemu" />
        <div className="border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-medium">Błąd</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader title="Zdrowie systemu" />
      <div className="grid w-full gap-6 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-slate-400">Backend</p>
          <p className="text-lg font-semibold text-slate-800">
            {health?.status === "ok" ? "Działa" : health?.status ?? "—"}
          </p>
          {health?.service && (
            <p className="text-sm text-slate-500">{health.service}</p>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-slate-400">Baza danych</p>
          <p className="text-lg font-semibold text-slate-800">
            {dbSize != null ? `${dbSize} MB` : "—"}
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
