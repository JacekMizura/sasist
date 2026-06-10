/** Polish NIP normalization and checksum validation. */

export function normalizePolishNip(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return digits;
}

export function validatePolishNipChecksum(nip: string): boolean {
  const d = normalizePolishNip(nip);
  if (!d) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * weights[i];
  const check = sum % 11;
  if (check === 10) return false;
  return check === Number(d[9]);
}

export function formatNipDisplay(nip: string): string {
  const d = normalizePolishNip(nip);
  if (!d) return nip;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
}
