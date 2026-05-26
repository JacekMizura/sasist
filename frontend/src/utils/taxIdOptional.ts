/** Optional NIP / tax id — aligned with backend `business_entity_validators.validate_tax_id_optional`. */
export function taxIdValidationMessage(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const compact = t.replace(/[\s-]/g, "");
  if (compact.length > 20) return "NIP: maks. 20 znaków (bez spacji i myślników).";
  if (!/^[0-9A-Za-z]+$/.test(compact)) return "NIP: dozwolone są cyfry i litery (oraz spacje/myślniki w zapisie).";
  return null;
}
