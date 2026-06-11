import type { RmzLineSidebarStatus } from "./rmzProcessLineSidebar";

type UnitRow = {
  decision: "ACCEPTED" | "DAMAGED" | "REJECTED" | null;
};

/** Map unit rows → sidebar status (mockup: pending / accepted / damaged / rejected). */
export function resolveRmzLineSidebarStatus(
  qty: number,
  rows: UnitRow[],
): { status: RmzLineSidebarStatus; resolved: boolean } {
  const slice = rows.slice(0, Math.max(0, qty));
  const checked = slice.filter((r) => r.decision != null).length;
  const resolved = checked >= qty && qty > 0;
  if (!resolved) return { status: "pending", resolved: false };

  const decisions = slice.map((r) => r.decision).filter(Boolean) as Array<"ACCEPTED" | "DAMAGED" | "REJECTED">;
  if (decisions.length === 0) return { status: "pending", resolved: false };
  const first = decisions[0]!;
  const homogeneous = decisions.every((d) => d === first);
  if (!homogeneous) return { status: "mixed", resolved: true };
  if (first === "ACCEPTED") return { status: "accepted", resolved: true };
  if (first === "DAMAGED") return { status: "damaged", resolved: true };
  return { status: "rejected", resolved: true };
}
