import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Layers, Pencil, Plus, Trash2, ChevronRight, Check, X } from "lucide-react";
import toast from "react-hot-toast";

import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { OrderAutomationActionGroup } from "../../utils/orderAutomationLocalStore";
import { loadActionGroups, newUid, saveActionGroups } from "../../utils/orderAutomationLocalStore";

export default function OrderAutomationGroupsPage() {
  const { warehouse } = useWarehouse();
  const wid = warehouse?.id ?? null;
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("settings.automation");

  const [groups, setGroups] = useState<OrderAutomationActionGroup[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const reload = useCallback(() => {
    if (wid == null) return;
    const g = loadActionGroups(DAMAGE_TENANT_ID, wid).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pl"));
    setGroups(g);
  }, [wid]);

  useEffect(() => {
    reload();
  }, [reload]);

  const persist = useCallback(
    (next: OrderAutomationActionGroup[]) => {
      if (wid == null) return;
      const sorted = [...next].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pl"));
      setGroups(sorted);
      saveActionGroups(DAMAGE_TENANT_ID, wid, sorted);
    },
    [wid],
  );

  const startEdit = (g: OrderAutomationActionGroup) => {
    setEditingId(g.id);
    setEditName(g.name);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) {
      toast.error("Podaj nazwę grupy.");
      return;
    }
    persist(groups.map((g) => (g.id === editingId ? { ...g, name } : g)));
    setEditingId(null);
    toast.success("Zapisano nazwę.");
  };

  const addGroup = () => {
    if (wid == null) return;
    const maxOrder = groups.reduce((m, g) => Math.max(m, g.sortOrder), 0);
    const g: OrderAutomationActionGroup = { id: newUid("grp"), name: "Nowa grupa", sortOrder: maxOrder + 10 };
    persist([...groups, g]);
    toast.success("Dodano grupę.");
    startEdit(g);
  };

  const removeGroup = (id: string) => {
    const g = groups.find((x) => x.id === id);
    if (!g) return;
    if (!window.confirm(`Usunąć grupę „${g.name}”?`)) return;
    persist(groups.filter((x) => x.id !== id));
    if (editingId === id) setEditingId(null);
    toast.success("Usunięto.");
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = groups.findIndex((g) => g.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= groups.length) return;
    const next = [...groups];
    [next[idx], next[j]] = [next[j], next[idx]];
    const reordered = next.map((g, i) => ({ ...g, sortOrder: (i + 1) * 10 }));
    persist(reordered);
  };

  const sorted = useMemo(() => [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pl")), [groups]);

  if (wid == null) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 m-4 md:m-8">
        Wybierz magazyn w nagłówku aplikacji.
      </div>
    );
  }

  if (!canWrite) {
    return (
      <div className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 m-4 md:m-8">
        Brak uprawnienia <span className="font-mono text-[11px]">settings.automation</span>.
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen p-4 md:p-8 text-[13px] text-gray-800 font-sans w-full">
      <div className="max-w-[1600px] mx-auto space-y-6">
        
        {/* BREADCRUMBS I NAGŁÓWEK */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>

            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Grupy akcji automatycznych
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={addGroup}
              className="px-4 py-2 text-sm font-bold text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" strokeWidth={2} /> Dodaj grupę
            </button>
          </div>
        </div>

        {/* LISTA GRUP */}
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 shadow-sm mb-6">
              <Layers className="h-8 w-8 text-gray-400" strokeWidth={1.75} aria-hidden />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Brak grup akcji</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-600">
              Grupy służą do logicznego układania reguł na liście automatyzacji. Utwórz pierwszą grupę, nadaj jej czytelną nazwę (np. „Priorytet”, „Integracje”), a następnie przypisz reguły do grupy w edytorze.
            </p>
            <button type="button" onClick={addGroup} className="mt-6 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              Utwórz pierwszą grupę
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            
            {/* Nagłówek Tabeli */}
            <div className="grid grid-cols-[6rem_1fr_8rem] items-center px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-500">
              <div className="text-center">Kolejność</div>
              <div>Nazwa grupy</div>
              <div className="text-right pr-2">Akcje</div>
            </div>

            <div className="divide-y divide-gray-100">
              {sorted.map((g, i) => (
                <div key={g.id} className="grid grid-cols-[6rem_1fr_8rem] items-center px-5 py-4 hover:bg-blue-50/20 transition-colors group">
                  
                  {/* Akcje porządkowania */}
                  <div className="flex justify-center items-center gap-1">
                    <button
                      type="button"
                      aria-label="Wyżej"
                      disabled={i === 0}
                      onClick={() => move(g.id, -1)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors"
                    >
                      <ArrowUp className="w-4 h-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      aria-label="Niżej"
                      disabled={i === sorted.length - 1}
                      onClick={() => move(g.id, 1)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 transition-colors"
                    >
                      <ArrowDown className="w-4 h-4" strokeWidth={2} />
                    </button>
                  </div>

                  {/* Nazwa Grupy lub Tryb Edycji */}
                  <div className="flex items-center gap-3 min-w-0 pr-4">
                    {editingId === g.id ? (
                      <div className="flex w-full max-w-xl items-center gap-2">
                        <input 
                          className="flex-1 px-3 py-2 text-sm border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm transition-colors" 
                          value={editName} 
                          onChange={(e) => setEditName(e.target.value)} 
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit();
                            if (e.key === 'Escape') { setEditingId(null); reload(); }
                          }}
                          autoFocus 
                          placeholder="Wpisz nazwę grupy..."
                        />
                        <button 
                          type="button" 
                          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5" 
                          onClick={commitEdit}
                        >
                          <Check className="w-4 h-4" /> Zapisz
                        </button>
                        <button
                          type="button"
                          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-1.5"
                          onClick={() => {
                            setEditingId(null);
                            reload();
                          }}
                        >
                          <X className="w-4 h-4" /> Anuluj
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-[15px] font-bold text-gray-900 truncate">
                          {g.name}
                        </span>
                        <span className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500 shadow-sm" title="Kolejność w interfejsie API">
                          #{g.sortOrder}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Przyciski Akcji */}
                  <div className="flex items-center justify-end gap-1">
                    {editingId !== g.id && (
                      <>
                        <button 
                          type="button"
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                          title="Edytuj nazwę grupy"
                          onClick={() => startEdit(g)}
                        >
                          <Pencil className="w-4 h-4" strokeWidth={2} />
                        </button>
                        <button 
                          type="button"
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Usuń grupę"
                          onClick={() => removeGroup(g.id)}
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={2} />
                        </button>
                      </>
                    )}
                  </div>

                </div>
              ))}
            </div>
          </div>
        )}

        {sorted.length > 0 && (
          <p className="text-sm text-gray-500 flex items-center justify-center pt-2">
            Kolejność wyświetlania na listach zmieniasz strzałkami. 
          </p>
        )}

      </div>
    </div>
  );
}