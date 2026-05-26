import { useCallback, useEffect, useMemo, useState } from "react";

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

import {

  useWarehouseCarriersPaths,

  useWarehouseCarriersSurface,

  useWarehouseCarriersTenant,

} from "./warehouseCarriersTenant";



function countActive(carriers: WarehouseCarrierRead[]) {

  return carriers.filter((c) => String(c.status || "").toUpperCase() === "ACTIVE").length;

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

    const active = countActive(rows);

    return { total, active, groupCount: groups.length };

  }, [rows, groups]);



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

    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/40 px-4 py-8 text-center">

      <p className="text-sm font-semibold text-slate-700">Brak nośników w tej grupie</p>

      <p className="mt-2 text-xs text-slate-600">

        Przygotuj pulę nośników z panelu lub przypisz przy przyjęciu PZ w WMS — oba sposoby działają równolegle.

      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">

        <button

          type="button"

          onClick={() => openCreate(groupId, "bulk")}

          className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-amber-700"

        >

          + Dodaj nośniki

        </button>

        <button

          type="button"

          onClick={() => openCreate(groupId, "single")}

          className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-950 hover:bg-amber-50"

        >

          Utwórz 1 nośnik

        </button>

      </div>

    </div>

  );



  const title = "Nośniki magazynowe";

  const subtitle =

    "";



  return (

    <div className="p-4 sm:p-8">

      <div className="mx-auto max-w-6xl space-y-6">

        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">

          <div>

            <h1 className="text-2xl font-black text-slate-900">{title}</h1>

            <p className="text-sm text-slate-600">{subtitle}</p>

            {!loading && !err ? (

              <p className="mt-2 text-xs font-bold text-slate-500">

                Grupy: <span className="tabular-nums text-slate-800">{stats.groupCount}</span> · Nośniki:{" "}

                <span className="tabular-nums text-slate-800">{stats.total}</span> · Aktywne:{" "}

                <span className="tabular-nums text-emerald-700">{stats.active}</span>

              </p>

            ) : null}

          </div>

          <div className="flex flex-wrap items-center gap-2">

            {tenantSelectVisible ? (

              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">

                <span className="text-xs font-bold uppercase text-slate-500">Podmiot</span>

                <select

                  value={tenantId}

                  onChange={(e) => setTenantId(Number(e.target.value) || 1)}

                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm"

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

              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-950 shadow-sm hover:bg-amber-100 disabled:opacity-50"

            >

              Utwórz 1 nośnik

            </button>

            <button

              type="button"

              onClick={() => openCreate(null, "bulk")}

              disabled={groups.length === 0}

              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"

            >

              + Dodaj nośniki

            </button>

            <button

              type="button"

              onClick={() => setGroupModalOpen(true)}

              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50"

            >

              + Nowa grupa

            </button>

          </div>

        </header>



        {toast ? (

          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">

            <span>{toast}</span>

            <button type="button" onClick={() => setToast(null)} className="text-xs font-bold uppercase text-emerald-800">

              Zamknij

            </button>

          </div>

        ) : null}



        {loading ? (

          <p className="py-12 text-center text-slate-500">Wczytywanie…</p>

        ) : err ? (

          <p className="py-12 text-center font-bold text-red-600">{err}</p>

        ) : groups.length === 0 ? (

          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">

            <p className="text-lg font-black text-slate-800">Brak grup nośników</p>

            <p className="mt-2 text-sm text-slate-600">Zdefiniuj typy (np. palety euro, kartony). Potem dodasz nośniki z tej zakładki.</p>

            <button

              type="button"

              onClick={() => setGroupModalOpen(true)}

              className="mt-6 rounded-xl bg-blue-600 px-6 py-3 text-sm font-black uppercase text-white shadow hover:bg-blue-700"

            >

              + Nowa grupa

            </button>

          </div>

        ) : (

          <div className="space-y-5">

            {groups.map((g) => {

              const list = byGroupId.get(g.id) ?? [];

              const activeN = countActive(list);

              return (

                <CarrierGroupCard

                  key={g.id}

                  title={(g.name || "").trim() || g.code}

                  subtitle={`Kod grupy: ${(g.code || "").trim() || "—"}`}

                  memberCount={list.length}

                  activeCount={activeN}

                  defaultOpen

                  headerActions={

                    <div className="flex flex-wrap gap-1">

                      <button

                        type="button"

                        onClick={() => openCreate(g.id, "single")}

                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"

                      >

                        1 szt.

                      </button>

                      <button

                        type="button"

                        onClick={() => openCreate(g.id, "bulk")}

                        className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-black uppercase text-white hover:bg-amber-700"

                      >

                        + Dodaj

                      </button>

                    </div>

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

                activeCount={countActive(orphan)}

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

      </div>



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

