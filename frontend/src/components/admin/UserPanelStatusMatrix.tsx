import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  fetchUserEffectiveStatusAccess,
  putUserStatusAccessOverrides,
  type WorkforceUserStatusEffectiveRow,
} from "../../api/workforceApi";
import { extractApiErrorMessage } from "../../api/authApi";
import { getOrderPanelSubgroups, getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import { useAuth } from "../../context/AuthContext";
import { isSuperRole } from "../../auth/isSuperRole";
import { translateMainGroup } from "../../utils/workforceUiLabels";
import { buildPanelSidebarLayout } from "../../utils/orderPanelSidebarBuckets";
import { MAIN_PANEL_GROUP_ORDER } from "../../utils/orderPanelMainGroupOrder";
import { ORDERS_PANEL_GROUP_LABELS } from "../orders/OrdersPanelStatusSidebar";
import {
  panelSidebarSubgroupHeaderCountBadgeClass,
  panelSidebarSubgroupRowClass,
} from "../../utils/panelSidebarHierarchy";
import type { OrderUiMainGroup, OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { StatusAccessCheckbox } from "./statusAccessCheckbox";

type FlagKey = "can_visible" | "can_edit" | "can_transition" | "can_process" | "can_print" | "can_complete";

function effFlags(row: WorkforceUserStatusEffectiveRow): Record<FlagKey, boolean> {
  return {
    can_visible: row.effective_can_visible,
    can_edit: row.effective_can_edit,
    can_transition: row.effective_can_transition,
    can_process: row.effective_can_process,
    can_print: row.effective_can_print,
    can_complete: row.effective_can_complete,
  };
}

function roleFlags(row: WorkforceUserStatusEffectiveRow): Record<FlagKey, boolean> {
  return {
    can_visible: row.role_can_visible,
    can_edit: row.role_can_edit,
    can_transition: row.role_can_transition,
    can_process: row.role_can_process,
    can_print: row.role_can_print,
    can_complete: row.role_can_complete,
  };
}

function hasWorkAccess(f: Record<FlagKey, boolean>): boolean {
  return f.can_edit || f.can_transition || f.can_process || f.can_print || f.can_complete;
}

function withWorkFlags(f: Record<FlagKey, boolean>, work: boolean): Record<FlagKey, boolean> {
  return {
    ...f,
    can_edit: work,
    can_transition: work,
    can_process: work,
    can_print: work,
    can_complete: work,
  };
}

function sortRowsPl(list: WorkforceUserStatusEffectiveRow[]): WorkforceUserStatusEffectiveRow[] {
  return [...list].sort((a, b) => (a.status_name ?? "").localeCompare(b.status_name ?? "", "pl"));
}

function normalizeMainGroup(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

type MatrixSectionPlain = { kind: "plain"; rows: WorkforceUserStatusEffectiveRow[] };
type MatrixSectionSubgroup = {
  kind: "subgroup";
  storageKey: string;
  title: string;
  rows: WorkforceUserStatusEffectiveRow[];
};

type MatrixMainCard = {
  groupKey: string;
  heading: string;
  sections: Array<MatrixSectionPlain | MatrixSectionSubgroup>;
};

type StatusMatrixSubgroupBlockProps = {
  storageKey: string;
  title: string;
  rowCount: number;
  children: ReactNode;
};

/**
 * Ta sama logika zwijania co {@link PanelSidebarSubgroupCollapsible} (sessionStorage),
 * w układzie tabeli `tbody` — bez zagnieżdżania `tr` w `div` z komponentu panelu.
 */
function StatusMatrixSubgroupBlock({ storageKey, title, rowCount, children }: StatusMatrixSubgroupBlockProps) {
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) !== "0";
    } catch {
      return true;
    }
  });

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        //
      }
      return next;
    });
  }, [storageKey]);

  return (
    <>
      <tr className="border-b border-slate-200 bg-slate-50/90">
        <td colSpan={3} className="p-0">
          <button type="button" onClick={toggle} className={panelSidebarSubgroupRowClass()}>
            <span className="flex items-center justify-center">
              {open ? (
                <ChevronDown className="h-3 w-3 text-slate-500" strokeWidth={2.25} aria-hidden />
              ) : (
                <ChevronRight className="h-3 w-3 text-slate-500" strokeWidth={2.25} aria-hidden />
              )}
            </span>
            <span className="truncate text-center tracking-normal">{title}</span>
            <span className={panelSidebarSubgroupHeaderCountBadgeClass()}>{rowCount}</span>
          </button>
        </td>
      </tr>
      {open ? children : null}
    </>
  );
}

type Props = {
  tenantId: number;
  warehouseId: number | null;
  targetUserId: number;
};

export default function UserPanelStatusMatrix({ tenantId, warehouseId, targetUserId }: Props) {
  const { user, hasPermission } = useAuth();
  const canRead =
    hasPermission("workforce.status_matrix.read") ||
    hasPermission("settings.users") ||
    isSuperRole(user?.role ?? "");
  const canWrite =
    hasPermission("workforce.status_matrix.write") ||
    hasPermission("settings.users") ||
    isSuperRole(user?.role ?? "");

  const [rows, setRows] = useState<WorkforceUserStatusEffectiveRow[]>([]);
  const [flagsByStatusId, setFlagsByStatusId] = useState<Record<number, Record<FlagKey, boolean>>>({});
  const [panelSummary, setPanelSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<OrderUiPanelSubgroupRead[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!canRead || warehouseId == null) return;
    setLoading(true);
    try {
      const data = await fetchUserEffectiveStatusAccess({
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        user_id: targetUserId,
      });
      const [summary, subgroups] = await Promise.all([
        getOrderUiStatusSummary(tenantId, warehouseId, { includeInactive: true }).catch(() => null),
        getOrderPanelSubgroups(tenantId, warehouseId).catch(() => null),
      ]);
      setRows(data);
      setPanelSummary(summary);
      setPanelSubgroups(subgroups);
      const map: Record<number, Record<FlagKey, boolean>> = {};
      for (const r of data) {
        map[r.order_ui_status_id] = effFlags(r);
      }
      setFlagsByStatusId(map);
    } catch {
      toast.error("Nie udało się wczytać uprawnień do statusów zamówień.");
    } finally {
      setLoading(false);
    }
  }, [canRead, tenantId, warehouseId, targetUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const blocksByMainGroup = useMemo(() => {
    const m = new Map<OrderUiMainGroup, OrderUiStatusPanelSummary["groups"][number]>();
    for (const b of panelSummary?.groups ?? []) {
      m.set(b.main_group, b);
    }
    return m;
  }, [panelSummary?.groups]);

  const orderedMainCards = useMemo((): MatrixMainCard[] => {
    const sgDefs: OrderUiPanelSubgroupRead[] = panelSubgroups ?? [];
    const cards: MatrixMainCard[] = [];

    for (const mg of MAIN_PANEL_GROUP_ORDER) {
      const groupRows = rows.filter((r) => normalizeMainGroup(r.main_group) === mg);
      if (!groupRows.length) continue;

      const byId = new Map(groupRows.map((r) => [r.order_ui_status_id, r]));
      const block = blocksByMainGroup.get(mg);
      const sections: Array<MatrixSectionPlain | MatrixSectionSubgroup> = [];

      if (block?.sub_statuses?.length) {
        const { ungrouped, subgroupSections } = buildPanelSidebarLayout(mg, block.sub_statuses, sgDefs);
        const consumed = new Set<number>();

        if (ungrouped.length) {
          const plain: WorkforceUserStatusEffectiveRow[] = [];
          for (const s of ungrouped) {
            const r = byId.get(s.id);
            if (r) {
              plain.push(r);
              consumed.add(s.id);
            }
          }
          if (plain.length) sections.push({ kind: "plain", rows: plain });
        }

        for (const sec of subgroupSections) {
          const secRows: WorkforceUserStatusEffectiveRow[] = [];
          for (const s of sec.rows) {
            const r = byId.get(s.id);
            if (r) {
              secRows.push(r);
              consumed.add(s.id);
            }
          }
          if (secRows.length) {
            sections.push({
              kind: "subgroup",
              storageKey: sec.key,
              title: sec.title,
              rows: secRows,
            });
          }
        }

        const orphans = groupRows.filter((r) => !consumed.has(r.order_ui_status_id));
        if (orphans.length) {
          sections.push({ kind: "plain", rows: sortRowsPl(orphans) });
        }
      } else {
        sections.push({ kind: "plain", rows: sortRowsPl(groupRows) });
      }

      cards.push({
        groupKey: mg,
        heading: ORDERS_PANEL_GROUP_LABELS[mg] ?? translateMainGroup(mg),
        sections,
      });
    }

    const nonStandard = rows.filter((r) => {
      const u = normalizeMainGroup(r.main_group);
      return u !== "NEW" && u !== "IN_PROGRESS" && u !== "DONE";
    });
    if (nonStandard.length) {
      const byG = new Map<string, WorkforceUserStatusEffectiveRow[]>();
      for (const r of nonStandard) {
        const k = (r.main_group ?? "").trim() || "—";
        if (!byG.has(k)) byG.set(k, []);
        byG.get(k)!.push(r);
      }
      const keys = Array.from(byG.keys()).sort((a, b) => a.localeCompare(b, "pl"));
      for (const k of keys) {
        const list = sortRowsPl(byG.get(k)!);
        cards.push({
          groupKey: k,
          heading: translateMainGroup(k === "—" ? null : k),
          sections: [{ kind: "plain", rows: list }],
        });
      }
    }

    return cards;
  }, [rows, panelSubgroups, blocksByMainGroup]);

  const setVisible = (statusId: number, value: boolean) => {
    if (!canWrite) return;
    const baseRow = rows.find((x) => x.order_ui_status_id === statusId);
    if (!baseRow) return;
    setFlagsByStatusId((prev) => {
      const cur = { ...(prev[statusId] ?? effFlags(baseRow)) };
      cur.can_visible = value;
      if (!value) return { ...prev, [statusId]: withWorkFlags(cur, false) };
      return { ...prev, [statusId]: cur };
    });
  };

  const setWork = (statusId: number, value: boolean) => {
    if (!canWrite) return;
    const baseRow = rows.find((x) => x.order_ui_status_id === statusId);
    if (!baseRow) return;
    setFlagsByStatusId((prev) => {
      const cur = { ...(prev[statusId] ?? effFlags(baseRow)) };
      const next = withWorkFlags(cur, value);
      if (value) next.can_visible = true;
      return { ...prev, [statusId]: next };
    });
  };

  const selectAllInGroup = (group: string, mode: "visible" | "work", value: boolean) => {
    if (!canWrite) return;
    const gNorm = normalizeMainGroup(group === "—" ? "" : group);
    const ids = rows
      .filter((r) => {
        const u = normalizeMainGroup(r.main_group);
        if (group === "—" || group === "") return u === "" || r.main_group == null || r.main_group === "";
        return u === gNorm;
      })
      .map((r) => r.order_ui_status_id);
    setFlagsByStatusId((prev) => {
      const n = { ...prev };
      for (const id of ids) {
        const row = rows.find((x) => x.order_ui_status_id === id);
        if (!row) continue;
        let cur = { ...(n[id] ?? effFlags(row)) };
        if (mode === "visible") {
          cur.can_visible = value;
          if (!value) cur = withWorkFlags(cur, false);
        } else {
          cur = withWorkFlags(cur, value);
          if (value) cur.can_visible = true;
        }
        n[id] = cur;
      }
      return n;
    });
  };

  const restoreFromRoleDefaults = () => {
    const n: Record<number, Record<FlagKey, boolean>> = {};
    for (const r of rows) {
      n[r.order_ui_status_id] = roleFlags(r);
    }
    setFlagsByStatusId(n);
    toast.success("Przywrócono ustawienia jak dla roli (domyślnie).");
  };

  const save = async () => {
    if (!canWrite || warehouseId == null) return;
    setSaving(true);
    try {
      const items = rows.map((s) => ({
        order_ui_status_id: s.order_ui_status_id,
        ...(flagsByStatusId[s.order_ui_status_id] ?? effFlags(s)),
      }));
      await putUserStatusAccessOverrides({
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        user_id: targetUserId,
        items,
      });
      toast.success("Zapisano dostęp do statusów.");
      await load();
    } catch (err: unknown) {
      console.error("[UserPanelStatusMatrix] save", err);
      toast.error(extractApiErrorMessage(err, "Zapis dostępu do statusów nie powiódł się."));
    } finally {
      setSaving(false);
    }
  };

  const renderStatusRow = (s: WorkforceUserStatusEffectiveRow) => {
    const f = flagsByStatusId[s.order_ui_status_id] ?? effFlags(s);
    const work = hasWorkAccess(f);
    const rowStyle = s.has_user_override ? "bg-cyan-50/35" : "";
    return (
      <tr
        key={s.order_ui_status_id}
        className={`border-b border-slate-100 last:border-0 ${rowStyle} hover:bg-slate-50/70`}
      >
        <td className="px-3 py-3 align-middle">
          <div className="whitespace-normal break-words font-medium leading-snug text-slate-900">
            {s.status_name ?? "—"}
          </div>
        </td>
        <td className="px-3 py-3 text-center align-middle">
          <StatusAccessCheckbox
            checked={f.can_visible}
            disabled={!canWrite}
            onChange={() => setVisible(s.order_ui_status_id, !f.can_visible)}
            aria-label={`Widoczny: ${s.status_name ?? ""}`}
          />
        </td>
        <td className="px-3 py-3 text-center align-middle">
          <StatusAccessCheckbox
            checked={work}
            disabled={!canWrite || !f.can_visible}
            onChange={() => setWork(s.order_ui_status_id, !work)}
            aria-label={`Może pracować: ${s.status_name ?? ""}`}
          />
        </td>
      </tr>
    );
  };

  if (!canRead) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Brak uprawnienia do zmiany dostępu do statusów zamówień.
      </div>
    );
  }

  if (warehouseId == null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        Wybierz magazyn w nagłówku aplikacji, aby ustawić widoczność statusów na panelu zamówień.
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 text-sm text-slate-700 ring-1 ring-slate-900/5">
        <p className="font-semibold text-slate-900">Statusy na panelu zamówień</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          Dla każdego statusu wybierz, czy pracownik <strong>widzi</strong> go na liście oraz czy może w nim{" "}
          <strong>pracować</strong> (obsługa, zmiana etapu, wydruk itd.). Ustawienia zapisują się osobno dla tej osoby
          i magazynu. Kolejność i sekcje odpowiadają panelowi operacyjnemu zamówień.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canWrite ? (
          <>
            <button
              type="button"
              onClick={restoreFromRoleDefaults}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Przywróć jak dla roli
            </button>
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => void save()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Zapisywanie…" : "Zapisz"}
            </button>
          </>
        ) : null}
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Ładowanie…</div>
      ) : (
        <div className="space-y-6">
          {orderedMainCards.map((card) => (
            <div
              key={card.groupKey}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-3">
                <div className="text-sm font-semibold text-slate-800">{card.heading}</div>
                {canWrite ? (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => selectAllInGroup(card.groupKey, "visible", true)}
                    >
                      Wszyscy: widok wł.
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => selectAllInGroup(card.groupKey, "visible", false)}
                    >
                      Wszyscy: widok wył.
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => selectAllInGroup(card.groupKey, "work", true)}
                    >
                      Wszyscy: praca wł.
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => selectAllInGroup(card.groupKey, "work", false)}
                    >
                      Wszyscy: praca wył.
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[min(100%,28rem)] table-fixed text-sm">
                  <thead className="border-b border-slate-200 bg-white">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      <th className="w-[45%] px-3 py-3 align-bottom">Status</th>
                      <th className="w-[15%] px-3 py-3 text-center align-bottom">Widoczny</th>
                      <th className="w-[15%] px-3 py-3 text-center align-bottom">Może pracować</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.sections.flatMap((sec, secIdx) => {
                      if (sec.kind === "plain") {
                        return sec.rows.map((s) => renderStatusRow(s));
                      }
                      const storageKey = `panel-sg:orders:${warehouseId}:${card.groupKey}:${sec.storageKey}`;
                      return (
                        <StatusMatrixSubgroupBlock
                          key={`${card.groupKey}-sg-${sec.storageKey}-${secIdx}`}
                          storageKey={storageKey}
                          title={sec.title}
                          rowCount={sec.rows.length}
                        >
                          {sec.rows.map((s) => renderStatusRow(s))}
                        </StatusMatrixSubgroupBlock>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
