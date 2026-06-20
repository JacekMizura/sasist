import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { moduleAutomationShellClass } from "../../components/layout/flatSectionTokens";
import { moduleListEmptyStateClass } from "../../components/listPage/moduleList";
import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { OrderAutomationActionGroup } from "../../utils/orderAutomationLocalStore";
import { loadActionGroups, newUid, saveActionGroups } from "../../utils/orderAutomationLocalStore";
import { oaBtn, oaBtnPri, oaIconGhost, oaInp, oaLbl } from "../../components/orders/automation/orderAutomationUiTokens";

export default function OrderAutomationGroupsPage() {
  const { warehouse } = useWarehouse();
  const wid = warehouse?.id ?? null;
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("settings.automation");

  const [groups, setGroups] = useState<OrderAutomationActionGroup[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

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
    setAdding(false);
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
    toast.success("Zapisano.");
  };

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setNewName("");
  };

  const commitAdd = () => {
    if (wid == null) return;
    const name = newName.trim();
    if (!name) {
      toast.error("Podaj nazwę grupy.");
      return;
    }
    if (groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Grupa o tej nazwie już istnieje.");
      return;
    }
    const maxOrder = groups.reduce((m, g) => Math.max(m, g.sortOrder), 0);
    persist([...groups, { id: newUid("grp"), name, sortOrder: maxOrder + 10 }]);
    setAdding(false);
    setNewName("");
    toast.success("Dodano grupę.");
  };

  const cancelAdd = () => {
    setAdding(false);
    setNewName("");
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
    return <p className="pt-6 text-sm text-slate-600">Wybierz magazyn w nagłówku aplikacji.</p>;
  }

  if (!canWrite) {
    return (
      <p className="pt-6 text-sm text-slate-600">
        Brak uprawnienia <span className="font-mono text-[11px]">settings.automation</span>.
      </p>
    );
  }

  return (
    <div className={`${moduleAutomationShellClass} w-full max-w-none`}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <p className="text-sm text-slate-500">Grupy organizują reguły na liście automatyzacji.</p>
        {!adding ? (
          <button type="button" onClick={startAdd} className={`${oaBtnPri} gap-2`}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Dodaj grupę
          </button>
        ) : null}
      </div>

      {adding ? (
        <div className="mb-8 max-w-md space-y-3">
          <label className={oaLbl}>
            Nazwa grupy
            <input
              className={oaInp}
              value={newName}
              placeholder="Np. Integracje"
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitAdd();
                if (e.key === "Escape") cancelAdd();
              }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={oaBtnPri} onClick={commitAdd}>Zapisz</button>
            <button type="button" className={oaBtn} onClick={cancelAdd}>Anuluj</button>
          </div>
        </div>
      ) : null}

      {sorted.length === 0 && !adding ? (
        <div className="py-10">
          <p className="text-sm font-medium text-slate-800">Brak grup akcji</p>
          <p className="mt-1 text-sm text-slate-500">Utwórz grupę, aby logicznie układać reguły na liście automatyzacji.</p>
          <button type="button" onClick={startAdd} className={`${oaBtnPri} mt-4 gap-2`}>
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Dodaj grupę
          </button>
        </div>
      ) : sorted.length > 0 ? (
        <ul className="divide-y divide-gray-200">
          {sorted.map((g, i) => (
            <li key={g.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-0">
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Wyżej" disabled={i === 0} className={oaIconGhost} onClick={() => move(g.id, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Niżej" disabled={i === sorted.length - 1} className={oaIconGhost} onClick={() => move(g.id, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                {editingId === g.id ? (
                  <div className="flex max-w-xl flex-wrap items-center gap-2">
                    <input
                      className={`${oaInp} flex-1`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") { setEditingId(null); reload(); }
                      }}
                      autoFocus
                    />
                    <button type="button" className={oaBtnPri} onClick={commitEdit}>Zapisz</button>
                    <button type="button" className={oaBtn} onClick={() => { setEditingId(null); reload(); }}>Anuluj</button>
                  </div>
                ) : (
                  <span className="text-sm font-medium text-slate-900">{g.name}</span>
                )}
              </div>

              {editingId !== g.id ? (
                <div className="flex items-center gap-1">
                  <button type="button" className={oaIconGhost} title="Edytuj" onClick={() => startEdit(g)}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" className={`${oaIconGhost} hover:text-red-600`} title="Usuń" onClick={() => removeGroup(g.id)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className={moduleListEmptyStateClass}>Dodaj pierwszą grupę powyżej.</div>
      )}

      {sorted.length > 0 ? (
        <p className="mt-6 text-xs text-slate-500">Kolejność wyświetlania na listach zmieniasz strzałkami.</p>
      ) : null}
    </div>
  );
}
