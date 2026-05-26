import type { ComponentType } from "react";
import { Package, Lock, Store, Clock, AlertTriangle, HelpCircle } from "lucide-react";
import type { StorageType } from "../types/warehouse";
import { normalizeStorageType } from "./storageTypes";

type IconProps = { size?: number; className?: string };

export const STORAGE_TYPE_ICONS: Record<StorageType, ComponentType<IconProps>> = {
  primary: Package,
  reserve: Lock,
  pick: Store,
  buffer: Clock,
  damaged: AlertTriangle,
};

export function StorageTypeIcon({
  storageType,
  size = 14,
  className,
}: {
  storageType: unknown;
  size?: number;
  className?: string;
}) {
  const normalized = normalizeStorageType(storageType);
  if (normalized === "unknown") {
    return <HelpCircle size={size} className={className} aria-hidden />;
  }
  const Icon = STORAGE_TYPE_ICONS[normalized];
  return <Icon size={size} className={className} aria-hidden />;
}

/** Same as {@link StorageTypeIcon} — shared name for warehouse / WMS location rows. */
export const LocationTypeIcon = StorageTypeIcon;
