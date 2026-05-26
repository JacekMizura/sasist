import { useCallback, useEffect, useState } from "react";

import {
  createReturnStatus,
  deleteReturnStatus,
  listReturnStatuses,
  updateReturnStatus,
} from "../../api/returnStatusesApi";
import { useWarehouse } from "../../context/WarehouseContext";
import type {
  ReturnStatusRead,
  ReturnStatusType,
  ReturnStatusUpdatePayload,
} from "../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import ReturnsModuleTabsStrip from "./ReturnsModuleTabsStrip";

const COLOR_OPTIONS = [
  "blue",
  "green",
  "red",
  "slate",
  "amber",
  "emerald",
  "rose",
  "violet",
  "orange",
  "cyan",
  "lime",
  "fuchsia",
] as const;

const COLOR_BADGE: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800 ring-blue-200",
  green: "bg-green-100 text-green-800 ring-green-200",
  red: "bg-red-100 text-red-800 ring-red-200",
  slate: "bg-slate-100 text-slate-800 ring-slate-200",
  amber: "bg-amber-100 text-amber-900 ring-amber-200",
  emerald: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  rose: "bg-rose-100 text-rose-800 ring-rose-200",
  violet: "bg-violet-100 text-violet-800 ring-violet-200",
  orange: "bg-orange-100 text-orange-900 ring-orange-200",
  cyan: "bg-cyan-100 text-cyan-900 ring-cyan-200",
  lime: "bg-lime-100 text-lime-900 ring-lime-200",
  fuchsia: "bg-fuchsia-100 text-fuchsia-900 ring-fuchsia-200",
};

const TYPE_OPTIONS: { value: ReturnStatusType; label: string }[] = [
  { value: "in_progress", label: "W toku (in_progress)" },
  { value: "done_success", label: "Zakończony pomyślnie (done_success)" },
  { value: "done_rejected", label: "Odrzucony (done_rejected)" },
];

function TypeLabel({ t }: { t: ReturnStatusType }) {
  const row = TYPE_OPTIONS.find((x) => x.value === t);
  return <span>{row?.label ?? t}</span>;
}

export default function ReturnStatusesPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [rows, setRows] = useState<ReturnStatusRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>("blue");
  const [newType, setNewType] = useState<ReturnStatusType>("in_progress");
  const [newTkey, setNewTkey] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ReturnStatusUpdatePayload>({});

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await listReturnStatuses(DAMAGE_TENANT_ID, warehouseId);
      setRows(data);
    } catch {
      setErr("Nie udało się wczytać statusów zwrotów.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (r: ReturnStatusRead) => {
    setEditingId(r.id);
    setEditDraft({
      name: r.name,
      color: r.color,
      type: r.type,
      transition_key: r.transition_key ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };

  const saveEdit = async () => {
    if (warehouseId == null || editingId == null) return;
    setErr(null);
    try {
      const payload: ReturnStatusUpdatePayload = {
        name: editDraft.name?.trim(),
        color: editDraft.color?.trim(),
        type: editDraft.type,
        transition_key:
          editDraft.transition_key === undefined
            ? undefined
            : String(editDraft.transition_key).trim() || null,
      };
      await updateReturnStatus(editingId, DAMAGE_TENANT_ID, warehouseId, payload);
      cancelEdit();
      await load();
    } catch {
      setErr("Nie udało się zapisać statusu.");
    }
  };

  const onCreate = async () => {
    if (warehouseId == null || !newName.trim()) return;
    setCreating(true);
    setErr(null);
    try {
      await createReturnStatus(DAMAGE_TENANT_ID, warehouseId, {
        name: newName.trim(),
        color: newColor.trim() || "blue",
        type: newType,
        transition_key: newTkey.trim() || null,
      });
      setNewName("");
      setNewTkey("");
      setNewColor("blue");
      setNewType("in_progress");
      await load();
    } catch {
      setErr("Nie udało się utworzyć statusu (sprawdź unikalność transition_key).");
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: number) => {
    if (warehouseId == null) return;
    if (!window.confirm("Usunąć ten status? Nie można, jeśli jest przypisany do RMZ.")) return;
    setErr(null);
    try {
      await deleteReturnStatus(id, DAMAGE_TENANT_ID, warehouseId);
      await load();
    } catch {
      setErr("Nie udało się usunąć (status może być używany).");
    }
  };

  return (
    <div className="w-full min-w-0 max-w-none">
      <ReturnsModuleTabsStrip />
      <h2 className="text-xl font-semibold text-slate-900">Statusy RMZ (workflow)</h2>
      <p className="mt-2 text-sm text-slate-600">
        Konfiguracja etykiet i kolorów dla dokumentów zwrotu. Logika aplikacji opiera się na polu typu (
        <code className="rounded bg-slate-100 px-1">in_progress</code> /{" "}
        <code className="rounded bg-slate-100 px-1">done_success</code> /{" "}
        <code className="rounded bg-slate-100 px-1">done_rejected</code>), nie na nazwie.
      </p>

      {warehouseId == null && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Wybierz magazyn w górnym pasku aplikacji.
        </p>
      )}

      {err && <p className="mt-4 text-sm text-rose-600">{err}</p>}

      {warehouseId != null && (
        <>
          <section className="mt-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">Nowy status</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                Nazwa
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="np. Oczekuje na kuriera"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                Kolor (UI)
                <select
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {COLOR_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                Typ (logika)
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as ReturnStatusType)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                Klucz workflow (opcjonalnie)
                <input
                  value={newTkey}
                  onChange={(e) => setNewTkey(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="np. start, office_pending…"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={creating || !newName.trim()}
              onClick={() => void onCreate()}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              Dodaj
            </button>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-slate-800">Lista</h2>
            {loading ? (
              <p className="mt-3 text-sm text-slate-500">Ładowanie…</p>
            ) : rows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">Brak statusów — domyślne tworzy się przy pierwszym RMZ lub migracji.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                    <tr>
                      <th className="px-3 py-2">ID</th>
                      <th className="px-3 py-2">Nazwa</th>
                      <th className="px-3 py-2">Kolor</th>
                      <th className="px-3 py-2">Typ</th>
                      <th className="px-3 py-2">transition_key</th>
                      <th className="px-3 py-2 text-right">Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) =>
                      editingId === r.id ? (
                        <tr key={r.id} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-2 tabular-nums text-slate-500">{r.id}</td>
                          <td className="px-3 py-2">
                            <input
                              value={editDraft.name ?? ""}
                              onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                              className="w-full min-w-[8rem] rounded border border-slate-200 px-2 py-1"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={editDraft.color ?? "blue"}
                              onChange={(e) => setEditDraft((d) => ({ ...d, color: e.target.value }))}
                              className="rounded border border-slate-200 px-2 py-1"
                            >
                              {COLOR_OPTIONS.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={editDraft.type ?? "in_progress"}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  type: e.target.value as ReturnStatusType,
                                }))
                              }
                              className="rounded border border-slate-200 px-2 py-1"
                            >
                              {TYPE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.value}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={editDraft.transition_key ?? ""}
                              onChange={(e) =>
                                setEditDraft((d) => ({ ...d, transition_key: e.target.value }))
                              }
                              className="w-full min-w-[6rem] rounded border border-slate-200 px-2 py-1"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="mr-2 text-xs font-semibold text-blue-600 hover:underline"
                              onClick={() => void saveEdit()}
                            >
                              Zapisz
                            </button>
                            <button
                              type="button"
                              className="text-xs font-semibold text-slate-600 hover:underline"
                              onClick={cancelEdit}
                            >
                              Anuluj
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 tabular-nums text-slate-500">{r.id}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{r.name}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ring-1 ${COLOR_BADGE[r.color] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}
                            >
                              {r.color}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <TypeLabel t={r.type} />
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {r.transition_key ?? (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="mr-3 text-xs font-semibold text-blue-600 hover:underline"
                              onClick={() => startEdit(r)}
                            >
                              Edytuj
                            </button>
                            <button
                              type="button"
                              className="text-xs font-semibold text-rose-600 hover:underline"
                              onClick={() => void onDelete(r.id)}
                            >
                              Usuń
                            </button>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
