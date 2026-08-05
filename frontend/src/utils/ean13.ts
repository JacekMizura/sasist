/**
 * GS1 EAN-13 check digit for the first 12 digits.
 * Weights alternate 1,3,1,3… from the left.
 */
export function ean13CheckDigit(digits12: string): string {
  const d = digits12.replace(/\D/g, "");
  if (d.length !== 12) {
    throw new Error("EAN-13 body must be exactly 12 digits");
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(d[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

/** True when value is 13 digits and the check digit is valid. */
export function isValidEan13(code: string): boolean {
  const d = String(code ?? "").replace(/\D/g, "");
  if (d.length !== 13) return false;
  try {
    return ean13CheckDigit(d.slice(0, 12)) === d[12];
  } catch {
    return false;
  }
}

/**
 * Fake but standards-compliant EAN-13 for demos / local testing.
 * Uses GS1 restricted-circulation prefix 200 (in-store / internal), random body + check digit.
 */
export function generateFakeEan13(): string {
  // 200…… = restricted circulation (company-internal) — not a real retail GTIN
  let body = "200";
  for (let i = 0; i < 9; i++) {
    body += String(Math.floor(Math.random() * 10));
  }
  return body + ean13CheckDigit(body);
}
