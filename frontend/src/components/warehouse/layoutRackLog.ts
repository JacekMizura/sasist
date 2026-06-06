import type { RackState } from "../../types/warehouse";
import { rackEntityKey } from "./warehouseUtils";

export type LayoutRackLogPayload = {
  rack_id?: number | string;
  local_id?: string;
  name?: string | null;
  rack_type?: string;
  x?: number;
  y?: number;
};

function toPayload(rack: RackState): LayoutRackLogPayload {
  return {
    rack_id: rack.id ?? rack.rack_index,
    local_id: rackEntityKey(rack),
    name: (rack.name ?? "").trim() || null,
    rack_type: rack.rack_type ?? "warehouse",
    x: rack.x,
    y: rack.y,
  };
}

export function logLayoutRackCreate(rack: RackState): void {
  console.info("[layout.rack.create]", toPayload(rack));
}

export function logLayoutRackRename(payload: {
  rack_id: number | string;
  local_id?: string;
  old_name: string | null;
  new_name: string | null;
  persisted?: boolean;
}): void {
  console.info("[layout.rack.rename]", payload);
}

export function logLayoutRackPersist(racks: RackState[]): void {
  console.info(
    "[layout.rack.persist]",
    racks.map((r) => toPayload(r))
  );
}

export function logLayoutRackHydrate(racks: RackState[]): void {
  console.info(
    "[layout.rack.hydrate]",
    racks.map((r) => toPayload(r))
  );
}

/** Dev-only: warn when a bulk update changes names on racks that were not the edit target. */
export function warnLayoutRackCrossMutation(
  before: RackState[],
  after: RackState[],
  context: string
): void {
  if (!import.meta.env.DEV) return;
  const beforeByKey = new Map(before.map((r) => [rackEntityKey(r), (r.name ?? "").trim()]));
  for (const r of after) {
    const key = rackEntityKey(r);
    const prev = beforeByKey.get(key);
    if (prev === undefined) continue;
    const next = (r.name ?? "").trim();
    if (prev !== next) {
      console.warn("[layout.rack.cross-mutation]", { context, local_id: key, old_name: prev || null, new_name: next || null });
    }
  }
}
