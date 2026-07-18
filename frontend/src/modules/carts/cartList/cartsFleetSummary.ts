import { CartStatus } from "../../../types/cartStatus";

export type CartsFleetSummary = {
  totalUnits: number;
  inUse: number;
  available: number;
  totalVolume: number;
  totalUsedVolume: number;
};

export type CartsFleetGroupItem = {
  id: number;
  name: string;
  status: string;
  used_volume?: number;
  total_volume_dm3?: number;
};

export type CartsFleetGroup = {
  id: number;
  name: string;
  items: CartsFleetGroupItem[];
};

export function computeCartsFleetSummary(groups: CartsFleetGroup[]): CartsFleetSummary {
  const items = groups.flatMap((g) => g.items ?? []);
  const totalUnits = items.length;
  const available = items.filter((c) => {
    const s = String(c.status ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_");
    return s === CartStatus.AVAILABLE;
  }).length;
  const inUse = totalUnits - available;
  const totalVolume = items.reduce((acc, c) => acc + Number(c.total_volume_dm3 || 0), 0);
  const totalUsedVolume = items.reduce((acc, c) => acc + Number(c.used_volume ?? 0), 0);
  return { totalUnits, inUse, available, totalVolume, totalUsedVolume };
}

export function globalFleetFillPercent(summary: CartsFleetSummary): number {
  const totalCapacity = summary.totalVolume || 1;
  return Math.min(100, Math.round((summary.totalUsedVolume / totalCapacity) * 100));
}
