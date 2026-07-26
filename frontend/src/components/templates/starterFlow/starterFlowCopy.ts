/**
 * Shared starter UX copy — identical across Szablony etykiet / wydruków / wiadomości / eksportów.
 * Starters are immutable system templates: never edit, delete, publish, or reassign in place.
 */

/** Card CTA on every starter tile. */
export const STARTER_USE_CTA_LABEL = "Użyj startera";

export const STARTER_CREATE_DIALOG_TITLE = "Utwórz własny szablon";

export const STARTER_CREATE_DIALOG_DESCRIPTION =
  "Tworzysz kopię startera systemowego. Oryginał pozostanie niezmieniony.";

export const STARTER_CREATE_NAME_LABEL = "Nazwa nowego szablonu";

export const STARTER_CREATE_CONFIRM_LABEL = "Utwórz szablon";

export const STARTER_CREATE_CANCEL_LABEL = "Anuluj";

/** Default name when starter has no title. */
export const STARTER_DEFAULT_COPY_NAME = "Kopia";

export function defaultStarterCopyName(starterName: string | null | undefined): string {
  const trimmed = String(starterName ?? "").trim();
  return trimmed || STARTER_DEFAULT_COPY_NAME;
}
