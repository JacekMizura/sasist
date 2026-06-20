import type { LucideIcon } from "lucide-react";

import type { OrderCustomFieldDto } from "../../../api/orderCustomFieldsApi";
import { orderCustomFieldHasAssignedIcon } from "../../../utils/orderCustomFieldListPresentation";
import { resolveOrderCustomFieldGlyph } from "../orderCustomFieldLucideIcon";
import {
  ocfFieldIconImageClass,
  ocfFieldIconLucideClass,
  ocfFieldIconMissingClass,
} from "./orderCustomFieldsListTokens";

export const OCF_FIELD_ICON_PX = 32;

type FieldIconProps = {
  field: OrderCustomFieldDto;
  /** Tekst gdy brak przypisanej ikony (nie domyślnej ikony typu). */
  emptyLabel?: "dash" | "brak";
};

/**
 * Jednolity renderer ikony pola na liście administracyjnej —
 * skalowanie, centrowanie (w komórce nadrzędnej), fallback, proporcje.
 */
export function FieldIcon({ field, emptyLabel = "dash" }: FieldIconProps) {
  if (!orderCustomFieldHasAssignedIcon(field)) {
    return (
      <span className={ocfFieldIconMissingClass}>{emptyLabel === "brak" ? "Brak" : "—"}</span>
    );
  }

  const settings = (field.settings_json ?? {}) as Record<string, unknown>;
  const resolved = resolveOrderCustomFieldGlyph(field.type, settings);

  if (resolved.kind === "image") {
    return (
      <img
        src={resolved.src}
        alt=""
        width={OCF_FIELD_ICON_PX}
        height={OCF_FIELD_ICON_PX}
        className={ocfFieldIconImageClass}
        draggable={false}
      />
    );
  }

  const Icon = resolved.Icon as LucideIcon;
  return <Icon className={ocfFieldIconLucideClass} strokeWidth={2} aria-hidden />;
}
