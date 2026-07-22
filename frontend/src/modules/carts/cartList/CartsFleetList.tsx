import { useCallback, useEffect, useMemo, useState } from "react";

import api from "../../../api/axios";
import { ConfirmModal } from "../../../components/ui/ConfirmModal";
import { useTranslation } from "../../../locales";
import { useWarehouse } from "../../../context/WarehouseContext";
import { useCartsRefresh } from "../../../context/CartsRefreshContext";
import CartCard from "../../../pages/CartsComponents/ui/CartCard";
import { CartLabelPrintModal } from "../../../pages/CartsComponents/CartLabelPrintModal";
import { CartsInlineGroupForm } from "../CartsInlineGroupForm";
import { useCartsTabActions } from "../CartsTabActionsContext";
import { cartsOrangeCtaClass, cartsOutlineCtaClass } from "../cartsModuleTokens";
import { CartsFleetGroupActions } from "./CartsFleetGroupActions";
import { CartsFleetGroupSection } from "./CartsFleetGroupSection";
import { CartsFleetSummaryKpi } from "./CartsFleetSummaryKpi";
import type { CapacitySnapshot } from "../../../types/cartCapacity";
import { computeCartsFleetSummary } from "./cartsFleetSummary";

const TENANT_ID = 1;

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
  total_baskets?: number;
  total_orders?: number;
  total_products?: number;
  baskets_used?: number;
  capacity?: CapacitySnapshot | null;
  capacity_strategy?: string;
  capacity_orders?: number | null;
  capacity_volume?: number | null;
  wms_picking_order_count?: number;
  wms_picking_product_count?: number;
  wms_picking_quantity?: number;
  assigned_user_id?: number | null;
  assigned_user_name?: string | null;
  assignment_type?: "collecting" | "packing" | null;
  assignment_since?: string | null;
};

type GroupType = { id: number; name: string; items: CartItemType[] };

export type CartsFleetCartType = "BULK" | "MULTI";

export type CartsFleetListProps = {
  cartType: CartsFleetCartType;
  refreshTrigger?: number;
  onAddNew: (groupId?: number) => void;
  onEdit: (id: number) => void;
};

export function CartsFleetList({ cartType, refreshTrigger = 0, onAddNew, onEdit }: CartsFleetListProps) {
  const t = useTranslation();
  const { warehouse } = useWarehouse();
  const ctx = useCartsRefresh();
  const refreshCarts = ctx?.refreshCarts;

  const [groups, setGroups] = useState<GroupType[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [printCart, setPrintCart] = useState<{ id: number; name: string } | null>(null);
  const [expandedCartId, setExpandedCartId] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<number | null>(null);
  const [confirmDeleteCartId, setConfirmDeleteCartId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/carts/?tenant_id=${TENANT_ID}&cart_type=${cartType}`);
      const raw = res.data;
      if (!Array.isArray(raw)) {
        setGroups([]);
        return;
      }
      const safe: GroupType[] = raw
        .map((g: unknown) => {
          const row = g as { id?: number; name?: string; items?: unknown[] };
          return {
            id: Number(row.id) || 0,
            name: String(row.name ?? ""),
            items: Array.isArray(row.items) ? (row.items as CartItemType[]) : [],
          };
        })
        .filter((g) => Number.isFinite(g.id));
      setGroups(safe);
    } catch (err) {
      console.error("[CartsFleetList] fetch error:", err);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [cartType]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, refreshTrigger]);

  useEffect(() => {
    setExpandedCartId(null);
  }, [cartType]);

  const handleResetFleet = useCallback(async () => {
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
      setConfirmReset(false);
    }
  }, [warehouse?.id, refreshCarts, fetchData]);

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await api.post(`/carts/groups/?tenant_id=${TENANT_ID}`, {
        cart_type: cartType,
        name: newGroupName,
        description: "",
      });
      setNewGroupName("");
      setShowGroupForm(false);
      await fetchData();
    } catch (err) {
      console.error("Błąd tworzenia grupy:", err);
    }
  };

  const handleDeleteCart = useCallback(async (id: number) => {
    try {
      await api.delete(`/carts/${id}/`);
      setConfirmDeleteCartId(null);
      await fetchData();
    } catch (err) {
      console.error("Błąd usuwania:", err);
    }
  }, [fetchData]);

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
      await fetchData();
    } catch (err) {
      console.error("Błąd edycji grupy:", err);
    }
  };

  const handleDeleteGroup = useCallback(async (groupId: number) => {
    if (groupId === 999) return;
    try {
      await api.delete(`/carts/groups/${groupId}/`);
      setConfirmDeleteGroupId(null);
      await fetchData();
    } catch (err) {
      console.error("Błąd usuwania grupy:", err);
    }
  }, [fetchData]);

  const summary = useMemo(() => computeCartsFleetSummary(groups), [groups]);
  const isMulti = cartType === "MULTI";

  const tabActions = useMemo(
    () => (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          disabled={resetting || !warehouse?.id}
          className={cartsOutlineCtaClass}
          title="Ustaw order.cart_id i basket_id na NULL, zeruj used_volume"
        >
          {resetting ? "…" : "Wyczyść przypisania"}
        </button>
        <button
          type="button"
          onClick={() => setShowGroupForm((v) => !v)}
          className={cartsOutlineCtaClass}
        >
          {showGroupForm ? t.cancel : `+ ${t.newGroup}`}
        </button>
      </div>
    ),
    [resetting, warehouse?.id, showGroupForm, t.cancel, t.newGroup],
  );

  useCartsTabActions(tabActions);

  return (
    <div className="w-full min-w-0 space-y-5">
      {!loading ? <CartsFleetSummaryKpi summary={summary} /> : null}

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
        <div className="space-y-2 py-8" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[68px] animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="w-full space-y-8">
          {groups.map((group) => {
            const count = group.items?.length ?? 0;
            const summaryText = count === 0 ? t.statusEmpty : t.statusAllOk;
            const isUnassigned = group.id === 999;

            const headerActions = isUnassigned ? (
              <button type="button" onClick={() => onAddNew()} className={cartsOrangeCtaClass}>
                {cartType === "BULK" ? t.addBulkCart : t.addMultiCart}
              </button>
            ) : (
              <CartsFleetGroupActions
                editing={editingGroupId === group.id}
                editingName={editingGroupName}
                onEditingNameChange={setEditingGroupName}
                onSaveEdit={() => void handleSaveGroupEdit()}
                onCancelEdit={() => {
                  setEditingGroupId(null);
                  setEditingGroupName("");
                }}
                onStartEdit={() => {
                  setEditingGroupId(group.id);
                  setEditingGroupName(group.name || "");
                }}
                onDeleteGroup={() => setConfirmDeleteGroupId(group.id)}
                onAddCart={() => onAddNew(isMulti ? group.id : undefined)}
                editLabel={t.editGroup}
                deleteLabel={t.deleteGroup}
                addCartLabel={`+ ${t.addCart}`}
                saveLabel={t.save}
                cancelLabel={t.cancel}
              />
            );

            return (
              <CartsFleetGroupSection
                key={group.id}
                title={group.name}
                count={count}
                summaryText={summaryText}
                headerActions={headerActions}
              >
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {count === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-slate-500">{t.noCartsInGroup}</div>
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
                        capacity={c.capacity}
                        capacity_strategy={c.capacity_strategy}
                        capacity_orders={c.capacity_orders}
                        capacity_volume={c.capacity_volume}
                        wms_picking_order_count={c.wms_picking_order_count}
                        wms_picking_product_count={c.wms_picking_product_count}
                        wms_picking_quantity={c.wms_picking_quantity}
                        assigned_user_id={c.assigned_user_id}
                        assigned_user_name={c.assigned_user_name}
                        assignment_type={c.assignment_type}
                        assignment_since={c.assignment_since}
                        image_url={c.image_url}
                        updated_at={c.updated_at}
                        length={c.length}
                        width={c.width}
                        height={c.height}
                        total_baskets={c.total_baskets}
                        tenant_id={isMulti ? TENANT_ID : undefined}
                        warehouse_id={isMulti ? warehouse?.id : undefined}
                        expanded={expandedCartId === c.id}
                        onToggleExpand={() =>
                          setExpandedCartId((prev) => (prev === c.id ? null : c.id))
                        }
                        onSimulateSuccess={fetchData}
                        onClearSuccess={fetchData}
                        onEdit={onEdit}
                        onDelete={(id) => setConfirmDeleteCartId(id)}
                        onPrintLabel={setPrintCart}
                      />
                    ))
                  )}
                </div>
              </CartsFleetGroupSection>
            );
          })}
        </div>
      )}

      <CartLabelPrintModal open={printCart != null} cart={printCart} onClose={() => setPrintCart(null)} />

      {confirmReset ? (
        <ConfirmModal
          title="Wyczyść przypisania"
          message="Usunąć wszystkie przypisania zamówień do wózków w aktywnym magazynie? Operacji nie można cofnąć."
          confirmLabel="Wyczyść"
          confirmTone="danger"
          pending={resetting}
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => void handleResetFleet()}
        />
      ) : null}

      {confirmDeleteGroupId != null ? (
        <ConfirmModal
          title="Usuń grupę"
          message={t.confirmDeleteGroup}
          confirmLabel="Usuń"
          confirmTone="danger"
          onCancel={() => setConfirmDeleteGroupId(null)}
          onConfirm={() => void handleDeleteGroup(confirmDeleteGroupId)}
        />
      ) : null}

      {confirmDeleteCartId != null ? (
        <ConfirmModal
          title="Usuń wózek"
          message={t.confirmDeleteCart}
          confirmLabel="Usuń"
          confirmTone="danger"
          onCancel={() => setConfirmDeleteCartId(null)}
          onConfirm={() => void handleDeleteCart(confirmDeleteCartId)}
        />
      ) : null}
    </div>
  );
}
