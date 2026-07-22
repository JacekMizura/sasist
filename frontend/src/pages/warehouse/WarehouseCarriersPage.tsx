import { useCallback, useEffect, useMemo, useState } from "react";
import { Package, PackageOpen, PackageCheck, Plus } from "lucide-react";

import {
  listWmsCarrierGroups,
  listWmsCarriers,
  type WarehouseCarrierBulkCreateResult,
  type WarehouseCarrierGroupRead,
  type WarehouseCarrierRead,
} from "../../api/wmsCarrierApi";
import { BulkCreateCarriersModal } from "../../components/warehouse/carriers/BulkCreateCarriersModal";
import { CarrierGroupCard } from "../../components/warehouse/carriers/CarrierGroupCard";
import { CarriersGroupTable } from "../../components/warehouse/carriers/CarriersGroupTable";
import { CreateCarrierGroupModal } from "../../components/warehouse/carriers/CreateCarrierGroupModal";
import { AppEmptyState } from "../../components/app-shell/AppEmptyState";
import { listSellasistInputClass } from "../../components/listPage/listSellasistTokens";
import { useCartsTabActions } from "../../modules/carts/CartsTabActionsContext";
import {
  cartsOrangeCtaClass,
  cartsOutlineCtaClass,
} from "../../modules/carts/cartsModuleTokens";
import { PurchasingKpiCard, PurchasingKpiGrid } from "../../modules/purchasing/ui";

import {
  useWarehouseCarriersPaths,
  useWarehouseCarriersSurface,
  useWarehouseCarriersTenant,
} from "./warehouseCarriersTenant";

/** Nośnik zajęty = ma pozycje (API: sku_count / total_qty; brak osobnego items_count). */
function carrierHasItems(c: WarehouseCarrierRead) {
  return (c.sku_count ?? 0) > 0 || (c.total_qty ?? 0) > 0;
}

function sortCarriers(list: WarehouseCarrierRead[]) {
  return [...list].sort((a, b) => (a.barcode || a.code).localeCompare(b.barcode || b.code, undefined, { numeric: true }));
}

type CreateModalState = { open: boolean; groupId: number | null; mode: "bulk" | "single" };

export default function WarehouseCarriersPage() {
  const surface = useWarehouseCarriersSurface();
  const paths = useWarehouseCarriersPaths(surface);
  const { tenantId, setTenantId, tenants, tenantSelectVisible } = useWarehouseCarriersTenant(surface);

  const [groups, setGroups] = useState<WarehouseCarrierGroupRead[]>([]);
  const [rows, setRows] = useState<WarehouseCarrierRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [createModal, setCreateModal] = useState<CreateModalState>({ open: false, groupId: null, mode: "bulk" });
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [g, r] = await Promise.all([listWmsCarrierGroups(tenantId), listWmsCarriers(tenantId)]);
      setGroups(Array.isArray(g) ? g : []);
      setRows(Array.isArray(r) ? r : []);
    } catch {
      setErr("Nie udało się wczytać nośników.");
      setGroups([]);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { byGroupId, orphan } = useMemo(() => {
    const m = new Map<number, WarehouseCarrierRead[]>();
    for (const g of groups) m.set(g.id, []);
    const o: WarehouseCarrierRead[] = [];
    for (const c of rows) {
      const gid = c.carrier_group_id;
      if (gid != null && gid >= 1 && m.has(gid)) m.get(gid)!.push(c);
      else o.push(c);
    }
    for (const [, arr] of m) sortCarriers(arr);
    sortCarriers(o);
    return { byGroupId: m, orphan: o };
  }, [groups, rows]);

  const stats = useMemo(() => {
    const total = rows.length;
    const occupied = rows.filter(carrierHasItems).length;
    const empty = total - occupied;
    const occupiedPct = total > 0 ? Math.round((occupied / total) * 100) : 0;
    const emptyPct = total > 0 ? Math.round((empty / total) * 100) : 0;
    return { total, occupied, empty, occupiedPct, emptyPct };
  }, [rows]);

  const navState = { tenantId };

  const upsertRow = (updated: WarehouseCarrierRead) => {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === updated.id);
      if (i < 0) return sortCarriers([...prev, updated]);
      const next = [...prev];
      next[i] = updated;
      return next;
    });
  };

  const onCreated = (result: WarehouseCarrierBulkCreateResult | WarehouseCarrierRead) => {
    if ("created_count" in result) {
      setToast(`Utworzono ${result.created_count} nośników (${result.first_barcode} … ${result.last_barcode}).`);
    } else {
      setToast(`Utworzono nośnik ${result.code}.`);
    }
    void load();
  };

  const openCreate = (groupId: number | null, mode: "bulk" | "single" = "bulk") => {
    setCreateModal({ open: true, groupId, mode });
  };

  const emptyGroupCta = (groupId: number) => (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-800">Brak nośników w tej grupie</p>
      <p className="mt-1.5 text-sm text-slate-500">
        Przygotuj pulę nośników z panelu lub przypisz przy przyjęciu PZ w WMS.
      </p>
      <button
        type="button"
        onClick={() => openCreate(groupId, "bulk")}
        className={`${cartsOrangeCtaClass} mt-4`}
      >
        Dodaj nośnik
      </button>
    </div>
  );

  const tabActions = useMemo(
    () => (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {tenantSelectVisible ? (
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <span className="text-xs font-medium text-slate-500">Podmiot</span>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(Number(e.target.value) || 1)}
              className={`${listSellasistInputClass} !h-9 w-auto min-w-[8rem]`}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || `Tenant #${t.id}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => openCreate(null, "single")}
          disabled={groups.length === 0}
          className={cartsOutlineCtaClass}
        >
          Utwórz 1 nośnik
        </button>
        <button
          type="button"
          onClick={() => openCreate(null, "bulk")}
          disabled={groups.length === 0}
          className={cartsOrangeCtaClass}
        >
          Dodaj nośniki
        </button>
        <button type="button" onClick={() => setGroupModalOpen(true)} className={cartsOutlineCtaClass}>
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          Nowa grupa
        </button>
      </div>
    ),
    [tenantSelectVisible, tenantId, tenants, groups.length, setTenantId],
  );
  useCartsTabActions(tabActions);

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        Rejestr nośników magazynowych pogrupowanych według typu (palety, kartony, wózki).
      </p>

      {toast ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900">
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)} className="text-xs font-semibold text-emerald-800">
            Zamknij
          </button>
        </div>
      ) : null}

      {!loading && !err ? (
        <PurchasingKpiGrid columns={3}>
          <PurchasingKpiCard
            title="Nośniki"
            value={stats.total}
            subtitle="wszystkie"
            tone="blue"
            density="compact"
            icon={<Package aria-hidden />}
          />
          <PurchasingKpiCard
            title="Zajęte"
            value={stats.occupied}
            subtitle={`${stats.occupiedPct}% nośników`}
            tone="amber"
            density="compact"
            icon={<PackageCheck aria-hidden />}
          />
          <PurchasingKpiCard
            title="Puste"
            value={stats.empty}
            subtitle={`${stats.emptyPct}% nośników`}
            tone="emerald"
            density="compact"
            icon={<PackageOpen aria-hidden />}
          />
        </PurchasingKpiGrid>
      ) : null}

      {loading ? (
        <div className="space-y-2 py-8" aria-busy="true" aria-label="Ładowanie nośników">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : err ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-8 text-center">
          <p className="text-sm font-medium text-amber-900">{err}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100"
          >
            Spróbuj ponownie
          </button>
        </div>
      ) : groups.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <AppEmptyState
            icon={Package}
            title="Brak grup nośników"
            description="Zdefiniuj typy (np. palety euro, kartony). Potem dodasz nośniki z tej zakładki."
            action={
              <button type="button" onClick={() => setGroupModalOpen(true)} className={cartsOrangeCtaClass}>
                Nowa grupa
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => {
            const list = byGroupId.get(g.id) ?? [];
            return (
              <CarrierGroupCard
                key={g.id}
                title={(g.name || "").trim() || g.code}
                subtitle={`Kod grupy: ${(g.code || "").trim() || "—"}`}
                memberCount={list.length}
                defaultOpen
                headerActions={
                  <button type="button" onClick={() => openCreate(g.id, "bulk")} className={cartsOrangeCtaClass}>
                    Dodaj nośnik
                  </button>
                }
              >
                <CarriersGroupTable
                  tenantId={tenantId}
                  rows={list}
                  groups={groups}
                  detailPath={(id) => paths.detail(id)}
                  navState={navState}
                  onRowUpdated={upsertRow}
                  emptyHint={emptyGroupCta(g.id)}
                />
              </CarrierGroupCard>
            );
          })}

          {orphan.length > 0 ? (
            <CarrierGroupCard
              title="Nieprzypisane do grupy"
              subtitle="Nośniki bez carrier_group_id lub ze zdjętą grupą"
              memberCount={orphan.length}
              defaultOpen={false}
            >
              <CarriersGroupTable
                tenantId={tenantId}
                rows={orphan}
                groups={groups}
                detailPath={(id) => paths.detail(id)}
                navState={navState}
                onRowUpdated={upsertRow}
              />
            </CarrierGroupCard>
          ) : null}
        </div>
      )}

      <CreateCarrierGroupModal
        tenantId={tenantId}
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onCreated={() => void load()}
      />

      <BulkCreateCarriersModal
        tenantId={tenantId}
        open={createModal.open}
        groups={groups}
        initialGroupId={createModal.groupId}
        initialMode={createModal.mode}
        onClose={() => setCreateModal((s) => ({ ...s, open: false }))}
        onSuccess={onCreated}
      />
    </div>
  );
}
