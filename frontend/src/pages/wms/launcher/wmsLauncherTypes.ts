import type { WmsTabId } from "../wmsTabConfig";

export type WmsModuleBadgeTone = "neutral" | "active" | "warning" | "critical";

export type WmsModuleBadge = {
  label: string;
  tone: WmsModuleBadgeTone;
};

export type WmsLauncherBadgeMap = Partial<Record<WmsTabId, WmsModuleBadge>>;
