import { ean13CheckDigit } from "./ean13";

/** Fake but valid EAN-13 (re-export for call sites that generate product codes together). */
export { generateFakeEan13, isValidEan13 } from "./ean13";

function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += String(Math.floor(Math.random() * 10));
  return s;
}

function randomAlphaNum(n: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  return s;
}

/** Demo SKU / symbol, e.g. SKU-7K2M9Q. */
export function generateFakeSku(): string {
  return `SKU-${randomAlphaNum(6)}`;
}

/** Demo catalog number, e.g. CAT-482917. */
export function generateFakeCatalogNumber(): string {
  return `CAT-${randomDigits(6)}`;
}

/** Alias kept for callers that imported EAN helpers from a codes module. */
export function generateFakeEan13Local(): string {
  const body = `200${randomDigits(9)}`;
  return body + ean13CheckDigit(body);
}
