export function computeTwigBreadcrumbs(content: string, lineNumber: number): string[] {
  const lines = content.split("\n").slice(0, Math.max(1, lineNumber));
  const crumbs: string[] = [];
  for (const line of lines) {
    const ext = line.match(/\{%\s*extends\s+['"]([^'"]+)['"]/);
    if (ext?.[1]) crumbs.push(ext[1]);
    const incDoc = line.match(/include_document\s+['"]([^'"]+)['"]/);
    if (incDoc?.[1]) crumbs.push(incDoc[1]);
    const inc = line.match(/\{%\s*include\s+['"]([^'"]+)['"]/);
    if (inc?.[1]) crumbs.push(inc[1]);
  }
  if (!crumbs.length) return ["document"];
  return crumbs;
}
