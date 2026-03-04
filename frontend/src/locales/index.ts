/**
 * System tłumaczeń (i18n) – moduł Wózki.
 * Wszystkie teksty UI są w frontend/src/locales/pl.json.
 * Import JSON + hook useTranslation() – po zapisie pl.json (dev) HMR odświeża teksty w aplikacji.
 */

import pl from "./pl.json";

export type Translations = typeof pl;

/** Hook zwracający aktualne tłumaczenia (PL). Edytuj pl.json i zapisz – w dev zmiany widać od razu. */
export function useTranslation(): Translations {
  return pl;
}

/** Surowy obiekt tłumaczeń (gdy hook nie jest dostępny). */
export const translations: Translations = pl;

export default pl;
