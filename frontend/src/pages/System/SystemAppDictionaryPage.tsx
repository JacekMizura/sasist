import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import toast from "react-hot-toast";

import {
  fetchSystemLabels,
  patchSystemLabel,
  seedSystemLabels,
  type SystemLabelDto,
} from "../../api/systemLabelsApi";
import { isSuperRole } from "../../auth/isSuperRole";
import { useAuth } from "../../context/AuthContext";
import { getLabel, useLabels } from "../../labels";

const CATEGORY_LABELS: Record<string, string> = {
  app: "Aplikacja",
  navigation: "Nawigacja",
  system: "System",
  general: "Ogólne",
};

export default function SystemAppDictionaryPage() {
  const { user } = useAuth();
  const { supportMode, setSupportMode, refresh } = useLabels();
  const [rows, setRows] = useState<SystemLabelDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const allowed = isSuperRole(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      await seedSystemLabels();
      const data = await fetchSystemLabels(q.trim() ? { q: q.trim() } : undefined);
      setRows(data);
      setDrafts(Object.fromEntries(data.map((r) => [r.id, r.custom_value ?? ""])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się wczytać słownika");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const grouped = useMemo(() => {
    const map = new Map<string, SystemLabelDto[]>();
    for (const r of rows) {
      const cat = r.category || "general";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  if (!allowed) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Słownik aplikacji jest dostępny wyłącznie dla roli SUPER_ADMIN.
      </div>
    );
  }

  const saveRow = async (row: SystemLabelDto) => {
    setSavingId(row.id);
    try {
      const raw = drafts[row.id] ?? "";
      const updated = await patchSystemLabel(row.id, raw.trim() ? raw.trim() : null);
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      setDrafts((d) => ({ ...d, [row.id]: updated.custom_value ?? "" }));
      await refresh();
      toast.success("Zapisano etykietę");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Zapis nieudany");
    } finally {
      setSavingId(null);
    }
  };

  const resetRow = async (row: SystemLabelDto) => {
    setDrafts((d) => ({ ...d, [row.id]: "" }));
    setSavingId(row.id);
    try {
      const updated = await patchSystemLabel(row.id, null);
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      await refresh();
      toast.success("Przywrócono wartość domyślną");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset nieudany");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {getLabel("system.labels.title", "Słownik aplikacji")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Nadpisuj etykiety UI bez zmiany kodu. Puste pole = wartość domyślna systemu.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-blue-600"
            checked={supportMode}
            onChange={(e) => setSupportMode(e.target.checked)}
          />
          <span>
            <span className="font-medium text-slate-900">
              {getLabel("system.labels.supportMode", "Tryb support")}
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {getLabel(
                "system.labels.supportHint",
                "Pokazuje: Nazwa własna (system: Nazwa domyślna)",
              )}
            </span>
          </span>
        </label>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load();
          }}
          placeholder={getLabel("system.labels.searchPlaceholder", "Szukaj po kluczu lub nazwie…")}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 text-xs font-medium text-blue-700 hover:underline"
        >
          Szukaj
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Ładowanie…</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-slate-500">{getLabel("system.labels.empty", "Brak etykiet")}</p>
      ) : (
        grouped.map(([category, items]) => (
          <section key={category} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <header className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-slate-900">
                {CATEGORY_LABELS[category] ?? category}
              </h3>
              <p className="text-xs text-slate-500">{items.length} etykiet</p>
            </header>
            <ul className="divide-y divide-slate-100">
              {items.map((row) => {
                const previewCustom = (drafts[row.id] ?? "").trim();
                const preview = previewCustom || row.default_value;
                const supportPreview =
                  supportMode && previewCustom && previewCustom !== row.default_value
                    ? `${previewCustom} (system: ${row.default_value})`
                    : preview;
                return (
                  <li key={row.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {getLabel("system.labels.systemName", "Nazwa systemowa")}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-xs text-slate-800" title={row.key}>
                        {row.key}
                      </p>
                      {row.description ? (
                        <p className="mt-1 text-xs text-slate-500">{row.description}</p>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {getLabel("system.labels.displayName", "Nazwa wyświetlana")}
                      </label>
                      <input
                        className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                        value={drafts[row.id] ?? ""}
                        placeholder={row.default_value}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [row.id]: e.target.value }))
                        }
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        Domyślna: <span className="text-slate-600">{row.default_value}</span>
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {getLabel("system.labels.usagePreview", "Podgląd użycia")}
                      </p>
                      <p className="mt-1 rounded-md border border-dashed border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800">
                        {supportPreview}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-center">
                      <button
                        type="button"
                        disabled={savingId === row.id}
                        onClick={() => void saveRow(row)}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {getLabel("system.labels.save", "Zapisz")}
                      </button>
                      <button
                        type="button"
                        disabled={savingId === row.id || !(row.custom_value || drafts[row.id])}
                        onClick={() => void resetRow(row)}
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        {getLabel("system.labels.reset", "Przywróć domyślną")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
