const warned = new Set<string>();

/** Log a single operational warning per session key — avoids console spam. */
export function logOperationalOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

export function resetOperationalWarnings(): void {
  warned.clear();
}
