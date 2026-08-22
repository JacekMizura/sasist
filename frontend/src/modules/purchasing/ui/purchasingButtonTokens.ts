/**
 * @deprecated Prefer `PrimaryButton` / `SecondaryButton` / `GhostButton` from `design-system`.
 * Thin facade — maps purchasing CTA classes onto Sasist UI Kit.
 */
import {
  ghostButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../../../design-system/components/Button/buttonClasses";

/** Główna akcja strony (CTA) — Design System Primary. */
export const purchasingBtnPrimary = primaryButtonClass;

/** Akcje pomocnicze w pasku nagłówka lub filtrów. */
export const purchasingBtnSecondary = secondaryButtonClass;

/** Akcje drugorzędne / anulowanie / wyłączone. */
export const purchasingBtnGhost = ghostButtonClass;

/** Nawigacja do innego widoku (tekstowy link). */
export const purchasingLinkClass =
  "text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline";

/** Kompaktowy secondary CTA w nagłówku sekcji (Link lub button). */
export const purchasingSectionLinkBtnClass = `inline-flex items-center gap-1.5 ${purchasingBtnSecondary}`;

/** Link w nagłówku sekcji tabeli (bez podkreślenia domyślnie). @deprecated Prefer {@link purchasingSectionLinkBtnClass}. */
export const purchasingLinkSectionClass = "text-sm font-medium text-blue-600 hover:text-blue-700";

/** @deprecated Użyj {@link purchasingBtnSecondary}. */
export const purchasingFilterButtonClass = purchasingBtnSecondary;

/** @deprecated Użyj {@link purchasingBtnPrimary}. */
export const purchasingFilterPrimaryButtonClass = purchasingBtnPrimary;
