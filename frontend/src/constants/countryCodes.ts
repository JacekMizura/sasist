/** ISO 3166-1 alpha-2 — stored as ``country_code`` (API / DB). */

export type CountryOption = { code: string; name: string; flag: string };

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: "PL", name: "Polska", flag: "🇵🇱" },
  { code: "DE", name: "Niemcy", flag: "🇩🇪" },
  { code: "CZ", name: "Czechy", flag: "🇨🇿" },
  { code: "SK", name: "Słowacja", flag: "🇸🇰" },
  { code: "AT", name: "Austria", flag: "🇦🇹" },
  { code: "FR", name: "Francja", flag: "🇫🇷" },
  { code: "ES", name: "Hiszpania", flag: "🇪🇸" },
  { code: "IT", name: "Włochy", flag: "🇮🇹" },
  { code: "NL", name: "Holandia", flag: "🇳🇱" },
  { code: "BE", name: "Belgia", flag: "🇧🇪" },
  { code: "GB", name: "Wielka Brytania", flag: "🇬🇧" },
  { code: "IE", name: "Irlandia", flag: "🇮🇪" },
  { code: "SE", name: "Szwecja", flag: "🇸🇪" },
  { code: "NO", name: "Norwegia", flag: "🇳🇴" },
  { code: "DK", name: "Dania", flag: "🇩🇰" },
  { code: "FI", name: "Finlandia", flag: "🇫🇮" },
  { code: "LT", name: "Litwa", flag: "🇱🇹" },
  { code: "LV", name: "Łotwa", flag: "🇱🇻" },
  { code: "EE", name: "Estonia", flag: "🇪🇪" },
  { code: "RO", name: "Rumunia", flag: "🇷🇴" },
  { code: "BG", name: "Bułgaria", flag: "🇧🇬" },
  { code: "HU", name: "Węgry", flag: "🇭🇺" },
  { code: "UA", name: "Ukraina", flag: "🇺🇦" },
  { code: "US", name: "Stany Zjednoczone", flag: "🇺🇸" },
  { code: "CN", name: "Chiny", flag: "🇨🇳" },
];

const byCode = new Map(COUNTRY_OPTIONS.map((c) => [c.code, c]));

export function countryLabel(code: string | null | undefined): string {
  if (!code?.trim()) return "—";
  const u = code.trim().toUpperCase();
  return byCode.get(u)?.name ?? u;
}
