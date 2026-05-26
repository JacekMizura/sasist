import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import {
  createReturnPanelSubgroup,
  deleteReturnPanelSubgroup,
  getReturnPanelSubgroups,
  reorderReturnPanelSubgroups,
  updateReturnPanelSubgroup,
} from "../../api/returnUiStatusApi";
import {
  stBtnDanger,
  stBtnPrimary,
  stCard,
  stCardBody,
  stCardHead,
  stFieldLabel,
  stIconBtn,
  stInput,
  stSelect,
} from "../../components/settings/panelUiStatusSettingsStyles";
import type { ReturnUiMainGroup, ReturnUiPanelSubgroupRead } from "../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";

const GROUP_ORDER: ReturnUiMainGroup[] = ["NEW", "IN_PROGRESS", "DONE"];
const GROUP_LABELS: Record<ReturnUiMainGroup, string> = {
  NEW: "Nowe zwroty",
  IN_PROGRESS: "W toku",
  DONE: "Zakończone",
};

type Props = {
  warehouseId: number;
  onChanged?: () => void;
};

/** Zakładka „Podgrupy” — słownik nazw per grupa główna (zwroty). */
export function ReturnPanelSubgroupsManager({ warehouseId, onChanged }: Props) {
  const [rows, setRows] = useState<ReturnUiPanelSubgroupRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newMg, setNewMg] = useState<ReturnUiMainGroup>("IN_PROGRESS");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await getReturnPanelSubgroups(DAMAGE_TENANT_ID, warehouseId);
      setRows(data);
    } catch {
      setErr("Nie udało się wczytać podgrup.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const byGroup = useMemo(() => {
    const m: Record<ReturnUiMainGroup, ReturnUiPanelSubgroupRead[]> = { NEW: [], IN_PROGRESS: [], DONE: [] };
    for (const r of rows) {
      const g = r.main_group as ReturnUiMainGroup;
      if (m[g]) m[g].push(r);
    }
    for (const g of GROUP_ORDER) {
      m[g].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pl"));
    }
    return m;
  }, [rows]);

  const refresh = async () => {
    await load();
    onChanged?.();
  };

  const onAdd = async () => {
    const n = newName.trim();
    if (!n) return;
    setErr(null);
    try {
      await createReturnPanelSubgroup(DAMAGE_TENANT_ID, { main_group: newMg, name: n }, warehouseId);
      setNewName("");
      await refresh();
    } catch {
      setErr("Nie udało się dodać (unikalna nazwa w grupie głównej).");
    }
  };

  const onSaveEdit = async (id: number) => {
    const n = editName.trim();
    if (!n) return;
    setErr(null);
    try {
      await updateReturnPanelSubgroup(id, DAMAGE_TENANT_ID, { name: n }, warehouseId);
      setEditingId(null);
      await refresh();
    } catch {
      setErr("Nie udało się zapisać nazwy.");
    }
  };

  const onDelete = async (id: number) => {
    if (!window.confirm("Usunąć podgrupę? Działa tylko gdy żaden status jej nie używa.")) return;
    setErr(null);
    try {
      await deleteReturnPanelSubgroup(id, DAMAGE_TENANT_ID, warehouseId);
      await refresh();
    } catch (e: unknown) {
      const st = (e as { response?: { status?: number } })?.response?.status;
      setErr(st === 409 ? "Podgrupa jest przypisana do statusów — najpierw zmień statusy." : "Nie udało się usunąć.");
    }
  };

  const move = async (mg: ReturnUiMainGroup, id: number, dir: "up" | "down") => {
    setErr(null);
    try {
      const next = await reorderReturnPanelSubgroups(
        DAMAGE_TENANT_ID,
        {
          main_group: mg,
          subgroup_id: id,
          direction: dir,
        },
        warehouseId,
      );
      setRows(next);
      onChanged?.();
    } catch {
      setErr("Nie udało się zmienić kolejności.");
    }
  };

  return (
    <div className="space-y-4">
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      <div className={stCard}>
        <div className={stCardHead}>
          <h2 className="text-sm font-semibold text-slate-800">Dodaj podgrupę</h2>
          <p className="mt-0.5 text-xs text-slate-500">Nazwy wybierzesz potem na liście statusów zamiast wpisywać ręcznie.</p>
        </div>
        <div className={`${stCardBody} flex flex-wrap items-end gap-3`}>
          <label className="min-w-[10rem]">
            <span className={stFieldLabel}>Grupa główna</span>
            <select value={newMg} onChange={(e) => setNewMg(e.target.value as ReturnUiMainGroup)} className={stSelect}>
              {GROUP_ORDER.map((g) => (
                <option key={g} value={g}>
                  {GROUP_LABELS[g]}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[12rem] flex-1">
            <span className={stFieldLabel}>Nazwa podgrupy</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className={stInput} placeholder="np. Weryfikacja" />
          </label>
          <button type="button" className={stBtnPrimary} onClick={() => void onAdd()}>
            Dodaj
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">Ładowanie…</p> : null}

      {GROUP_ORDER.map((mg) => (
        <div key={mg} className={stCard}>
          <div className={stCardHead}>
            <h3 className="text-sm font-semibold text-slate-800">{GROUP_LABELS[mg]}</h3>
          </div>
          <div className={stCardBody}>
            {byGroup[mg].length === 0 ? (
              <p className="text-sm text-slate-500">Brak zdefiniowanych podgrup.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {byGroup[mg].map((r, idx) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0">
                    {editingId === r.id ? (
                      <>
                        <input className={`${stInput} max-w-xs`} value={editName} onChange={(e) => setEditName(e.target.value)} />
                        <button type="button" className={stBtnPrimary} onClick={() => void onSaveEdit(r.id)}>
                          Zapisz
                        </button>
                        <button type="button" className="text-sm text-slate-600 hover:text-slate-900" onClick={() => setEditingId(null)}>
                          Anuluj
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 font-medium text-slate-800">{r.name}</span>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            className={stIconBtn}
                            disabled={idx === 0}
                            title="Wyżej"
                            onClick={() => void move(mg, r.id, "up")}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={stIconBtn}
                            disabled={idx >= byGroup[mg].length - 1}
                            title="Niżej"
                            onClick={() => void move(mg, r.id, "down")}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          onClick={() => {
                            setEditingId(r.id);
                            setEditName(r.name);
                          }}
                        >
                          Zmień nazwę
                        </button>
                        <button type="button" className={stBtnDanger} onClick={() => void onDelete(r.id)}>
                          Usuń
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
