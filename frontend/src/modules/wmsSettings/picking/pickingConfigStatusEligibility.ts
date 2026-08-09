/**
 * Dozwolone statusy panelu dla konfiguratora zbierania — na bazie grup WMS i aktywności,
 * bez hardcodowanych nazw statusów.
 */
import type {
  OrderUiMainGroup,
  OrderUiStatusPanelSummary,
  OrderUiStatusWithCount,
} from "../../../types/orderUiStatus";

export type PickingConfigStatusRole = "source" | "target";

type FlatStatus = OrderUiStatusWithCount & { main_group: OrderUiMainGroup };

function isActiveStatus(s: { is_active?: boolean | null }): boolean {
  return s.is_active !== false;
}

export function flattenPanelStatuses(summary: OrderUiStatusPanelSummary | null | undefined): FlatStatus[] {
  const out: FlatStatus[] = [];
  for (const g of summary?.groups ?? []) {
    for (const s of g.sub_statuses ?? []) {
      out.push({ ...s, main_group: g.main_group ?? s.main_group });
    }
  }
  return out;
}

/**
 * Statusy, które mogą rozpocząć zbieranie: aktywne, w grupie NOWE / W TOKU
 * (nie ZAKOŃCZONE). Opcjonalnie wyklucz źródła już zajęte przez inne reguły.
 */
export function allowedPickingSourceStatusIds(opts: {
  summary: OrderUiStatusPanelSummary | null | undefined;
  /** source_status_id innych reguł — nie pokazuj (poza bieżącą edycją). */
  excludeSourceIds?: Iterable<number>;
}): Set<number> {
  const excluded = new Set(
    [...(opts.excludeSourceIds ?? [])].filter((id) => Number.isFinite(id) && id > 0).map((id) => Number(id)),
  );
  const ids = new Set<number>();
  for (const s of flattenPanelStatuses(opts.summary)) {
    if (!isActiveStatus(s)) continue;
    if (s.main_group === "DONE") continue;
    if (excluded.has(s.id)) continue;
    ids.add(s.id);
  }
  return ids;
}

/**
 * Statusy po zbieraniu: aktywne W TOKU (+ statusy startowe pakowania z ustawień WMS,
 * bo to naturalny następny etap procesu).
 */
export function allowedPickingTargetStatusIds(opts: {
  summary: OrderUiStatusPanelSummary | null | undefined;
  packingStartStatusIds?: Iterable<number>;
}): Set<number> {
  const packingStarts = new Set(
    [...(opts.packingStartStatusIds ?? [])]
      .filter((id) => Number.isFinite(id) && id > 0)
      .map((id) => Number(id)),
  );
  const byId = new Map(flattenPanelStatuses(opts.summary).map((s) => [s.id, s]));
  const ids = new Set<number>();
  for (const s of byId.values()) {
    if (!isActiveStatus(s)) continue;
    if (s.main_group === "IN_PROGRESS") ids.add(s.id);
  }
  for (const id of packingStarts) {
    const s = byId.get(id);
    if (s && isActiveStatus(s)) ids.add(id);
  }
  return ids;
}

export function allowedPickingConfigStatusIds(opts: {
  summary: OrderUiStatusPanelSummary | null | undefined;
  role: PickingConfigStatusRole;
  excludeSourceIds?: Iterable<number>;
  packingStartStatusIds?: Iterable<number>;
}): Set<number> {
  if (opts.role === "source") {
    return allowedPickingSourceStatusIds({
      summary: opts.summary,
      excludeSourceIds: opts.excludeSourceIds,
    });
  }
  return allowedPickingTargetStatusIds({
    summary: opts.summary,
    packingStartStatusIds: opts.packingStartStatusIds,
  });
}

/** Panel summary z tylko dozwolonymi statusami (puste grupy usuwane). */
export function filterPanelSummaryByStatusIds(
  summary: OrderUiStatusPanelSummary | null | undefined,
  allowedIds: Set<number>,
  /** Zachowaj w liście (np. zapisany, ale już niedozwolony) — tylko do podglądu w polu. */
  retainIds?: Iterable<number>,
): OrderUiStatusPanelSummary | null {
  if (!summary) return null;
  const retain = new Set(
    [...(retainIds ?? [])].filter((id) => Number.isFinite(id) && id > 0).map((id) => Number(id)),
  );
  const keep = (id: number) => allowedIds.has(id) || retain.has(id);
  const groups = summary.groups
    .map((g) => ({
      ...g,
      sub_statuses: (g.sub_statuses ?? []).filter((s) => keep(s.id)),
      total_count: 0,
    }))
    .filter((g) => g.sub_statuses.length > 0)
    .map((g) => ({
      ...g,
      total_count: g.sub_statuses.reduce((acc, s) => acc + (s.count ?? 0), 0),
    }));
  return { groups, unassigned_count: summary.unassigned_count };
}

export function packingStartStatusIdsFromSettings(packing: {
  start_status_id?: number | null;
  allowed_start_status_ids?: number[] | null;
} | null | undefined): number[] {
  const out = new Set<number>();
  const start = packing?.start_status_id;
  if (start != null && Number.isFinite(start) && start > 0) out.add(Number(start));
  for (const id of packing?.allowed_start_status_ids ?? []) {
    if (Number.isFinite(id) && id > 0) out.add(Number(id));
  }
  return [...out];
}

export function isStatusAllowedForPickingConfig(
  statusId: number,
  allowedIds: Set<number>,
): boolean {
  return Number.isFinite(statusId) && statusId > 0 && allowedIds.has(statusId);
}
