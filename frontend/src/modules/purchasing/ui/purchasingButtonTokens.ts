import { brandPrimaryButtonClass } from "../../../design-system/brandUi";
import {
  filterToolbarBtnGhost,
  filterToolbarBtnSecondary,
} from "../../../components/filters/filterUiTokens";

/** Główna akcja strony (CTA) — Design System Primary (jak „Dodaj użytkownika”). */
export const purchasingBtnPrimary = brandPrimaryButtonClass;

/** Akcje pomocnicze w pasku nagłówka lub filtrów. */
export const purchasingBtnSecondary = filterToolbarBtnSecondary;

/** Akcje drugorzędne / anulowanie / wyłączone. */
export const purchasingBtnGhost = filterToolbarBtnGhost;

/** Nawigacja do innego widoku (tekstowy link). */
export const purchasingLinkClass =
  "text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline";

/** Link w nagłówku sekcji tabeli (bez podkreślenia domyślnie). */
export const purchasingLinkSectionClass = "text-sm font-medium text-blue-600 hover:text-blue-700";

/** @deprecated Użyj {@link purchasingBtnSecondary}. */
export const purchasingFilterButtonClass = purchasingBtnSecondary;

/** @deprecated Użyj {@link purchasingBtnPrimary}. */
export const purchasingFilterPrimaryButtonClass = purchasingBtnPrimary;
