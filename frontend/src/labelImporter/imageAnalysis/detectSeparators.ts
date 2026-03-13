export function detectSeparators(brightness: number[], threshold = 40): number[] {
  const separators: number[] = [];
  const n = brightness.length;
  let inDark = false;
  let start = 0;

  for (let x = 0; x < n; x += 1) {
    const isDark = brightness[x] < threshold;
    if (isDark && !inDark) {
      inDark = true;
      start = x;
    } else if (!isDark && inDark) {
      inDark = false;
      const end = x - 1;
      const mid = Math.round((start + end) / 2);
      separators.push(mid);
    }
  }

  if (inDark) {
    const end = n - 1;
    const mid = Math.round((start + end) / 2);
    separators.push(mid);
  }

  return separators;
}

