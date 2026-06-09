import { useEffect, useMemo, useState } from "react";
import api from "../../api/axios";
import CartCard from "./ui/CartCard";
import { CartLabelPrintModal } from "./CartLabelPrintModal";
import GroupHeader from "./ui/GroupHeader";
import SummaryDashboard from "./ui/SummaryDashboard";
import { useTranslation } from "../../locales";
import { CartsInlineGroupForm } from "../../modules/carts/CartsInlineGroupForm";
import { CartsListPageHeader } from "../../modules/carts/CartsListPageHeader";
import {
  cartsBtnApply,
  cartsBtnSecondary,
  cartsGroupShellClass,
  cartsInputClass,
  cartsPageShellClass,
} from "../../modules/carts/cartsModuleTokens";

/** Lista wózków standardowych (bulk) pogrupowanych; podsumowanie, grupy, przyciski dodawania. */

interface BulkCartListProps {
  refreshTrigger?: number;
  onAddNew: () => void;
  onEdit: (id: number) => void;
}

type AssignedOrderRef = { order_id: number; total_volume_dm3: number };

type CartItemType = {
  id: number;
  name: string;
  code?: string | null;
  status: string;
  used_volume?: number;
  total_volume_dm3?: number;
  assigned_orders?: AssignedOrderRef[];
  order_numbers?: string[];
  total_weight_kg?: number;
  image_url?: string | null;
  updated_at?: string | number | null;
  length?: number;
  width?: number;
  height?: number;
  total_orders?: number;
  total_products?: number;
  baskets_used?: number;
  capacity_mode?: string;
  max_orders?: number | null;
  max_volume_dm3?: number;
  wms_picking_order_count?: number;
  wms_picking_product_count?: number;
  wms_picking_quantity?: number;
};

type GroupType = { id: number; name: string; items: CartItemType[] };

export default function BulkCartList({ refreshTrigger = 0, onAddNew, onEdit }: BulkCartListProps) {
  const t = useTranslation();
  const [groups, setGroups] = useState<GroupType[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [printCart, setPrintCart] = useState<{ id: number; name: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/carts/?tenant_id=1&cart_type=BULK`);
      const raw = res.data;
      if (!Array.isArray(raw)) {
        console.error("[BulkCartList] GET /carts/ returned non-array:", res.status, typeof raw, raw);
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
      console.error("[BulkCartList] Błąd pobierania listy wózków:", err);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshTrigger]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await api.post(`/carts/groups/?tenant_id=1`, {
        cart_type: "BULK",
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
    <div className={`${cartsPageShellClass} animate-in fade-in duration-300`}>
      <CartsListPageHeader
        title={t.bulkCarts}
        description={t.singleCompartmentManagement}
        actions={
          <>
            <button type="button" onClick={() => setShowGroupForm(!showGroupForm)} className={cartsBtnSecondary}>
              {showGroupForm ? t.cancel : `+ ${t.newGroup}`}
            </button>
            <button type="button" onClick={onAddNew} className={cartsBtnApply}>
              + {t.addBulkCart}
            </button>
          </>
        }
      />

      <SummaryDashboard summary={summary} />

      {showGroupForm ? (
        <CartsInlineGroupForm
          value={newGroupName}
          onChange={setNewGroupName}
          onSubmit={handleCreateGroup}
          placeholder={t.groupNamePlaceholder}
          submitLabel={t.create}
        />
      ) : null}

      {loading ? (
        <div className="animate-pulse py-8 text-center text-sm text-slate-500">{t.loading}</div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const isCollapsed = Boolean(collapsed[group.id]);
            const count = group.items?.length ?? 0;
            const summaryText = count === 0 ? t.statusEmpty : t.statusAllOk;

            const rightActions =
              group.id === 999 ? (
                <button type="button" onClick={onAddNew} className={cartsBtnSecondary}>
                  + {t.addBulkCart}
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  {editingGroupId === group.id ? (
                    <>
                      <input
                        className={`${cartsInputClass} max-w-[10rem]`}
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveGroupEdit()}
                      />
                      <button type="button" onClick={handleSaveGroupEdit} className={cartsBtnApply}>
                        {t.save}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGroupId(null);
                          setEditingGroupName("");
                        }}
                        className={cartsBtnSecondary}
                      >
                        {t.cancel}
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => handleStartEditGroup(group)} className={cartsBtnSecondary}>
                        {t.editGroup}
                      </button>
                      <button type="button" onClick={() => handleDeleteGroup(group.id)} className={cartsBtnSecondary}>
                        {t.deleteGroup}
                      </button>
                      <button type="button" onClick={onAddNew} className={cartsBtnSecondary}>
                        + {t.addCart}
                      </button>
                    </>
                  )}
                </div>
              );

            return (
              <div key={group.id} className={cartsGroupShellClass}>
                <GroupHeader
                  title={group.name}
                  count={count}
                  summaryText={summaryText}
                  collapsed={isCollapsed}
                  onToggle={() => setCollapsed((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                  rightActions={rightActions}
                />

                {!isCollapsed && (
                  <div className="divide-y divide-slate-100 px-3">
                    {count === 0 ? (
                      <div className="py-6 text-center text-[13px] text-slate-500">{t.noCartsInGroup}</div>
                    ) : (
                      group.items.map((c) => (
                        <CartCard
                          key={c.id}
                          id={c.id}
                          name={c.name}
                          code={c.code}
                          status={c.status}
                          used_volume={c.used_volume}
                          total_volume_dm3={c.total_volume_dm3}
                          assigned_orders={c.assigned_orders}
                          order_numbers={c.order_numbers}
                          total_weight_kg={c.total_weight_kg}
                          total_orders={c.total_orders}
                          total_products={c.total_products}
                          baskets_used={c.baskets_used}
                          capacity_mode={c.capacity_mode}
                          max_orders={c.max_orders}
                          max_volume_dm3={c.max_volume_dm3}
                          wms_picking_order_count={c.wms_picking_order_count}
                          wms_picking_product_count={c.wms_picking_product_count}
                          wms_picking_quantity={c.wms_picking_quantity}
                          image_url={c.image_url}
                          updated_at={c.updated_at}
                          length={c.length}
                          width={c.width}
                          height={c.height}
                          onClearSuccess={fetchData}
                          onEdit={onEdit}
                          onDelete={handleDeleteCart}
                          onPrintLabel={setPrintCart}
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
      <CartLabelPrintModal
        open={printCart != null}
        cart={printCart}
        onClose={() => setPrintCart(null)}
      />
    </div>
  );
}