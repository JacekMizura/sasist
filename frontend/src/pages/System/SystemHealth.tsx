import { useEffect, useState } from "react";
import { getSystemHealth, getDbSize } from "../../api/systemApi";

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
      <div className="p-6">
        <p className="text-slate-500">Ładowanie…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800">
          <p className="font-medium">Błąd</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Zdrowie systemu</h2>
      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-400">Backend</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">
            {health?.status === "ok" ? "Działa" : health?.status ?? "—"}
          </p>
          {health?.service && (
            <p className="text-sm text-slate-500 mt-0.5">{health.service}</p>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-400">Baza danych</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">
            {dbSize != null ? `${dbSize} MB` : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
