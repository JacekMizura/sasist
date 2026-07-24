import { describe, expect, it } from "vitest";
import type { LocationAccessBinding } from "../../../api/warehouseRoutingApi";
import {
  buildAccessProblemItems,
  groupAccessProblemsByRack,
  isFunctionalRoutingLocation,
  operatorAccessReason,
} from "./locationAccessProblems";

describe("locationAccessProblems", () => {
  it("maps operator reasons distinctly", () => {
    expect(operatorAccessReason("BLOCKED")).toBe("Dojście zablokowane");
    expect(operatorAccessReason("UNREACHABLE")).toBe("Brak drogi w zasięgu");
    expect(operatorAccessReason("NO_RACK")).toBe("Bez przypisanego regału");
    expect(operatorAccessReason("OVERRIDE_BROKEN")).toBe("Ręczny punkt dostępu jest nieaktualny");
  });

  it("excludes START/DOCK functional locations from problem list", () => {
    expect(isFunctionalRoutingLocation({ location_type: "PICK_START", name: "START" })).toBe(true);
    expect(isFunctionalRoutingLocation({ location_type: "DOCK", name: "DOCK-IN" })).toBe(true);
    expect(isFunctionalRoutingLocation({ location_type: "NORMAL", name: "A23-A-1" })).toBe(false);

    const access: LocationAccessBinding[] = [
      {
        uuid: "a1",
        warehouse_id: 1,
        location_id: 10,
        binding_mode: "AUTO",
        status: "BLOCKED",
        rack_uuid: "s1",
      },
      {
        uuid: "a3",
        warehouse_id: 1,
        location_id: 458,
        binding_mode: "AUTO",
        status: "NO_RACK",
      },
      {
        uuid: "a4",
        warehouse_id: 1,
        location_id: 460,
        binding_mode: "AUTO",
        status: "NO_RACK",
      },
    ];
    const items = buildAccessProblemItems(
      access,
      [
        { id: 10, name: "A23-A-1", location_type: "NORMAL" },
        { id: 458, name: "DOCK-IN", location_type: "DOCK" },
        { id: 460, name: "START", location_type: "PICK_START" },
      ],
      [{ uuid: "s1", name: "S1", x: 0, y: 0, width: 1, height: 1 } as never]
    );
    expect(items).toHaveLength(1);
    expect(items[0].locationName).toBe("A23-A-1");
    expect(items[0].reason).toBe("Dojście zablokowane");
  });

  it("lists BLOCKED and storage NO_RACK separately and groups by rack", () => {
    const access: LocationAccessBinding[] = [
      {
        uuid: "a1",
        warehouse_id: 1,
        location_id: 10,
        binding_mode: "AUTO",
        status: "BLOCKED",
        rack_uuid: "s1",
      },
      {
        uuid: "a2",
        warehouse_id: 1,
        location_id: 11,
        binding_mode: "AUTO",
        status: "BLOCKED",
        rack_uuid: "s1",
      },
      {
        uuid: "a3",
        warehouse_id: 1,
        location_id: 12,
        binding_mode: "AUTO",
        status: "NO_RACK",
      },
      {
        uuid: "a4",
        warehouse_id: 1,
        location_id: 13,
        binding_mode: "AUTO",
        status: "RESOLVED",
        rack_uuid: "a1",
      },
    ];
    const items = buildAccessProblemItems(
      access,
      [
        { id: 10, name: "S1-A-1" },
        { id: 11, name: "S1-A-2" },
        { id: 12, name: "ORPHAN-1" },
        { id: 13, name: "A1-1" },
      ],
      [{ uuid: "s1", name: "S1", x: 0, y: 0, width: 1, height: 1 } as never]
    );
    expect(items).toHaveLength(3);
    expect(items.filter((i) => i.status === "BLOCKED")).toHaveLength(2);
    expect(items.filter((i) => i.status === "NO_RACK")).toHaveLength(1);
    expect(items.find((i) => i.status === "BLOCKED")!.reason).toBe("Dojście zablokowane");
    expect(items.find((i) => i.status === "NO_RACK")!.reason).toBe("Bez przypisanego regału");
    const groups = groupAccessProblemsByRack(items);
    expect(groups.some((g) => g.rackLabel === "S1")).toBe(true);
    expect(groups.some((g) => g.rackLabel === "Bez regału")).toBe(true);
  });
});
