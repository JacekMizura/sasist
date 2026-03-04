import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import CartCard from "./ui/CartCard";
import GroupHeader from "./ui/GroupHeader";
import SummaryDashboard from "./ui/SummaryDashboard";
import { useTranslation } from "../../locales";
import { useWarehouse } from "../../context/WarehouseContext";
import { useCartsRefresh } from "../../context/CartsRefreshContext";

/** Lista wózków sekcyjnych (multi) pogrupowanych; podsumowanie, grupy, przyciski dodawania. */

interface CartListProps {
  refreshTrigger?: number;
  onAddNew: (groupId?: number) => void;
  onEdit: (id: number) => void;
}

type AssignedOrderRef = { order_id: number; total_volume_dm3: number };

type CartItemType = {
  id: number;
  name: string;
  status: string;
  used_volume?: number;
  total_volume_dm3?: number;
  assigned_orders?: AssignedOrderRef[];
  order_numbers?: string[];
  total_weight_kg?: number;
  image_url?: string | null;
  total_baskets?: number;
};

type GroupType = { id: number; name: string; items: CartItemType[] };

const TENANT_ID = 1;

export default function CartList({ refreshTrigger = 0, onAddNew, onEdit }: CartListProps) {
  const t = useTranslation();
  const { warehouse } = useWarehouse();
  const ctx = useCartsRefresh();
  const refreshCarts = ctx?.refreshCarts;
  const [groups, setGroups] = useState<GroupType[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");

  // Pobieranie listy wózków sekcyjnych z API (grupy z przypisanymi wózkami).
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get("/carts/?tenant_id=1&cart_type=MULTI");
      const raw = res.data;
      if (!Array.isArray(raw)) {
        console.error("[CartList] GET /carts/ returned non-array:", res.status, typeof raw, raw);
        setGroups([]);
        return;
      }
      const safe: GroupType[] = raw.map((g: unknown) => {
        const row = g as { id?: number; name?: string; items?: unknown[] };
        return {
          id: Number(row.id) || 0,
          name: String(row.name ?? ""),
          items: Array.isArray(row.items) ? row.items as CartItemType[] : [],
        };
      }).filter((g) => Number.isFinite(g.id));
      setGroups(safe);
    } catch (err) {
      console.error("[CartList] Błąd pobierania listy wózków:", err);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshTrigger]);

  const handleResetFleet = async () => {
    if (!warehouse?.id) return;
    setResetting(true);
    try {
      await api.post("/optimizer/reset-fleet/", null, {
        params: { tenant_id: TENANT_ID, warehouse_id: warehouse.id },
      });
      refreshCarts?.();
      await fetchData();
    } catch (err) {
      console.error("Reset fleet error:", err);
    } finally {
      setResetting(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await api.post(`/carts/groups/?tenant_id=1`, {
        cart_type: "MULTI",
        name: newGroupName,
        description: "",
      });
      setNewGroupName("");
      setShowGroupForm(false);
      fetchData();
    } catch (err) {
      console.error("Błąd tworzenia grupy:", err);
    }
  };

  const handleDeleteCart = async (id: number) => {
    if (!window.confirm(t.confirmDeleteCart)) return;
    try {
      await api.delete(`/carts/${id}/`);
      fetchData();
    } catch (err) {
      console.error("Błąd usuwania:", err);
    }
  };

  const handleStartEditGroup = (group: GroupType) => {
    if (group.id === 999) return;
    setEditingGroupId(group.id);
    setEditingGroupName(group.name || "");
  };

  const handleSaveGroupEdit = async () => {
    if (!editingGroupId || !editingGroupName.trim()) {
      setEditingGroupId(null);
      setEditingGroupName("");
      return;
    }
    try {
      await api.put(`/carts/groups/${editingGroupId}/`, { name: editingGroupName });
      setEditingGroupId(null);
      setEditingGroupName("");
      fetchData();
    } catch (err) {
      console.error("Błąd edycji grupy:", err);
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (groupId === 999) return;
    if (!window.confirm(t.confirmDeleteGroup)) return;
    try {
      await api.delete(`/carts/groups/${groupId}/`);
      fetchData();
    } catch (err) {
      console.error("Błąd usuwania grupy:", err);
    }
  };

  const summary = useMemo(() => {
    const items = groups.flatMap((g) => g.items || []);
    const totalUnits = items.length;
    const available = items.filter((c) => {
      const s = String(c.status).toUpperCase();
      return s === "PUSTY" || s === "AVAILABLE" || s === "FREE";
    }).length;
    const inUse = totalUnits - available;
    const totalVolume = items.reduce((acc, c) => acc + Number(c.total_volume_dm3 || 0), 0);
    const totalUsedVolume = items.reduce((acc, c) => acc + Number(c.used_volume ?? 0), 0);
    return { totalUnits, inUse, available, totalVolume, totalUsedVolume };
  }, [groups]);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase italic leading-none">{t.sectionalCarts}</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
            {t.multiBasketManagement}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleResetFleet}
            disabled={resetting}
            className="bg-violet-50 text-violet-700 border border-violet-200 px-5 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-violet-100 disabled:opacity-50 transition-all"
            title="Ustaw order.cart_id i basket_id na NULL, zeruj used_volume"
          >
            {resetting ? "…" : "Wyczyść przypisania"}
          </button>
          <button
            onClick={() => setShowGroupForm(!showGroupForm)}
            className="bg-slate-100 text-slate-600 px-6 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-all"
          >
            {showGroupForm ? t.cancel : `+ ${t.newGroup}`}
          </button>
        </div>
      </div>

      <SummaryDashboard summary={summary} />

      {showGroupForm && (
        <div className="bg-blue-50 p-6 rounded-2xl border-2 border-dashed border-blue-200">
          <div className="flex gap-4 items-center">
            <input
              autoFocus
              placeholder={t.groupNamePlaceholder}
              className="flex-1 bg-white border-none rounded-xl px-6 py-3 text-[12px] font-black uppercase placeholder:text-slate-300 focus:ring-2 focus:ring-blue-600 outline-none"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
            />
            <button
              onClick={handleCreateGroup}
              className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black text-[11px] uppercase"
            >
              {t.create}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center font-black text-slate-200 animate-pulse uppercase tracking-widest">
          {t.loading}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const isCollapsed = Boolean(collapsed[group.id]);
            const count = group.items?.length ?? 0;
            const summaryText = count === 0 ? t.statusEmpty : t.statusAllOk;

            const rightActions =
              group.id === 999 ? (
                <button
                  onClick={() => onAddNew(undefined)}
                  className="bg-white border border-slate-200 px-4 py-2 rounded-xl hover:border-blue-600 transition-all shadow-sm text-[10px] font-black uppercase tracking-widest text-slate-500"
                >
                  + {t.addMultiCart}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {editingGroupId === group.id ? (
                    <>
                      <input
                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest outline-none focus:border-blue-600"
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveGroupEdit()}
                      />
                      <button
                        onClick={handleSaveGroupEdit}
                        className="bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest"
                      >
                        {t.save}
                      </button>
                      <button
                        onClick={() => {
                          setEditingGroupId(null);
                          setEditingGroupName("");
                        }}
                        className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest"
                      >
                        {t.cancel}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleStartEditGroup(group)}
                        className="bg-white border border-slate-200 px-4 py-2 rounded-xl hover:border-blue-600 transition-all shadow-sm text-[10px] font-black uppercase tracking-widest text-slate-500"
                      >
                        {t.editGroup}
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        className="bg-white border border-slate-200 px-4 py-2 rounded-xl hover:border-red-600 transition-all shadow-sm text-[10px] font-black uppercase tracking-widest text-slate-500"
                      >
                        {t.deleteGroup}
                      </button>
                      <button
                        onClick={() => onAddNew(group.id)}
                        className="bg-white border border-slate-200 px-4 py-2 rounded-xl hover:border-blue-600 transition-all shadow-sm text-[10px] font-black uppercase tracking-widest text-slate-500"
                      >
                        + {t.addCart}
                      </button>
                    </>
                  )}
                </div>
              );

            return (
              <div key={group.id} className="space-y-4">
                <GroupHeader
                  title={group.name}
                  count={count}
                  summaryText={summaryText}
                  collapsed={isCollapsed}
                  onToggle={() => setCollapsed((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                  rightActions={rightActions}
                />

                {!isCollapsed && (
                  <div className="grid grid-cols-1 gap-4">
                    {count === 0 ? (
                      <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest">
                        {t.noCartsInGroup}
                      </div>
                    ) : (
                      group.items.map((c) => (
                        <CartCard
                          key={c.id}
                          id={c.id}
                          name={c.name}
                          status={c.status}
                          used_volume={c.used_volume}
                          total_volume_dm3={c.total_volume_dm3}
                          assigned_orders={c.assigned_orders}
                          order_numbers={c.order_numbers}
                          total_weight_kg={c.total_weight_kg}
                          image_url={c.image_url}
                          total_baskets={c.total_baskets}
                          tenant_id={TENANT_ID}
                          warehouse_id={warehouse?.id}
                          onSimulateSuccess={fetchData}
                          onClearSuccess={fetchData}
                          onEdit={onEdit}
                          onDelete={handleDeleteCart}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}