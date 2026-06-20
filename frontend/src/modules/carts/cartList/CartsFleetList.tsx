import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";

import api from "../../../api/axios";
import { ListPageHeader } from "../../../components/listPage/ListPageHeader";
import {
  filterToolbarBtnApply,
  filterToolbarBtnSecondary,
} from "../../../components/filters/filterUiTokens";
import { useTranslation } from "../../../locales";
import { useWarehouse } from "../../../context/WarehouseContext";
import { useCartsRefresh } from "../../../context/CartsRefreshContext";
import CartCard from "../../../pages/CartsComponents/ui/CartCard";
import { CartLabelPrintModal } from "../../../pages/CartsComponents/CartLabelPrintModal";
import { CartsInlineGroupForm } from "../CartsInlineGroupForm";
import { CartsFleetGroupActions } from "./CartsFleetGroupActions";
import { CartsFleetGroupSection } from "./CartsFleetGroupSection";
import { CartsFleetSummaryKpi } from "./CartsFleetSummaryKpi";
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
  capacity_mode?: string;
  max_orders?: number | null;
  max_volume_dm3?: number;
  wms_picking_order_count?: number;
  wms_picking_product_count?: number;
  wms_picking_quantity?: number;
};

type GroupType = { id: number; name: string; items: CartItemType[] };

export type CartsFleetCartType = "BULK" | "MULTI";

export type CartsFleetListProps = {
  cartType: CartsFleetCartType;
  refreshTrigger?: number;
  onAddNew: (groupId?: number) => void;
  onEdit: (id: number) => void;
};

type FleetConfig = {
  pageTitle: string;
  description: string;
  breadcrumbLabel: string;
  addCartLabel: string;
  headerExtraActions?: (ctx: { resetting: boolean; onResetFleet: () => void }) => ReactNode;
  showHeaderAddCart: boolean;
};

function useFleetConfig(cartType: CartsFleetCartType, t: ReturnType<typeof useTranslation>): FleetConfig {
  if (cartType === "BULK") {
    return {
      pageTitle: t.bulkCarts,
      description: t.singleCompartmentManagement,
      breadcrumbLabel: "Wózki",
      addCartLabel: `+ ${t.addCart}`,
      showHeaderAddCart: true,
    };
  }
  return {
    pageTitle: t.sectionalCarts,
    description: t.multiBasketManagement,
    breadcrumbLabel: "Wózki z koszykami",
    addCartLabel: `+ ${t.addCart}`,
    showHeaderAddCart: false,
    headerExtraActions: ({ resetting, onResetFleet }) => (
      <button
        type="button"
        onClick={onResetFleet}
        disabled={resetting}
        className={filterToolbarBtnSecondary}
        title="Ustaw order.cart_id i basket_id na NULL, zeruj used_volume"
      >
        {resetting ? "…" : "Wyczyść przypisania"}
      </button>
    ),
  };
}

export function CartsFleetList({ cartType, refreshTrigger = 0, onAddNew, onEdit }: CartsFleetListProps) {
  const t = useTranslation();
  const config = useFleetConfig(cartType, t);
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

  const handleDeleteCart = async (id: number) => {
    if (!window.confirm(t.confirmDeleteCart)) return;
    try {
      await api.delete(`/carts/${id}/`);
      await fetchData();
    } catch (err) {
      console.error("Błąd usuwania:", err);
    }
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
      await fetchData();
    } catch (err) {
      console.error("Błąd edycji grupy:", err);
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (groupId === 999) return;
    if (!window.confirm(t.confirmDeleteGroup)) return;
    try {
      await api.delete(`/carts/groups/${groupId}/`);
      await fetchData();
    } catch (err) {
      console.error("Błąd usuwania grupy:", err);
    }
  };

  const summary = useMemo(() => computeCartsFleetSummary(groups), [groups]);
  const isMulti = cartType === "MULTI";

  return (
    <div className="w-full min-w-0 space-y-6">
      <ListPageHeader
        title={config.pageTitle}
        description={config.description}
        breadcrumbs={[
          { label: "Magazyn", to: "/carts/bulk" },
          { label: "WMS", to: cartType === "BULK" ? "/carts/bulk" : "/carts/baskets" },
          { label: config.breadcrumbLabel },
        ]}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {config.headerExtraActions?.({ resetting, onResetFleet: () => void handleResetFleet() })}
            <button type="button" onClick={() => setShowGroupForm((v) => !v)} className={filterToolbarBtnSecondary}>
              {showGroupForm ? t.cancel : `+ ${t.newGroup}`}
            </button>
            {config.showHeaderAddCart ? (
              <button type="button" onClick={() => onAddNew()} className={filterToolbarBtnApply}>
                <Plus className="mr-1.5 inline h-4 w-4" strokeWidth={2} aria-hidden />
                {cartType === "BULK" ? t.addBulkCart : t.addMultiCart}
              </button>
            ) : null}
          </div>
        }
      />

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
            <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : (
        <div className="w-full space-y-8">
          {groups.map((group) => {
            const count = group.items?.length ?? 0;
            const summaryText = count === 0 ? t.statusEmpty : t.statusAllOk;
            const isUnassigned = group.id === 999;

            const headerActions = isUnassigned ? (
              <button type="button" onClick={() => onAddNew()} className={filterToolbarBtnApply}>
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
                onDeleteGroup={() => void handleDeleteGroup(group.id)}
                onAddCart={() => onAddNew(isMulti ? group.id : undefined)}
                editLabel={t.editGroup}
                deleteLabel={t.deleteGroup}
                addCartLabel={config.addCartLabel}
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
                      <div key={c.id} className="px-4">
                        <CartCard
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
                          total_baskets={c.total_baskets}
                          tenant_id={isMulti ? TENANT_ID : undefined}
                          warehouse_id={isMulti ? warehouse?.id : undefined}
                          onSimulateSuccess={fetchData}
                          onClearSuccess={fetchData}
                          onEdit={onEdit}
                          onDelete={handleDeleteCart}
                          onPrintLabel={setPrintCart}
                        />
                      </div>
                    ))
                  )}
                </div>
              </CartsFleetGroupSection>
            );
          })}
        </div>
      )}

      <CartLabelPrintModal open={printCart != null} cart={printCart} onClose={() => setPrintCart(null)} />
    </div>
  );
}
