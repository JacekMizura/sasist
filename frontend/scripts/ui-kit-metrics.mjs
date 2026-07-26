#!/usr/bin/env node
/**
 * Sasist UI Kit migration metrics.
 * Usage: node scripts/ui-kit-metrics.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src");

const MAGIC_RE =
  /\b(?:rounded-(?:xl|lg|md)|shadow-(?:sm|lg)|h-(?:8|9|10)|bg-orange-\S+|text-orange-\S+)\b/g;

const FACADE_RE =
  /(?:filterUiTokens|listSellasistTokens|wmsOperationalUi|warehouseMaterialsUi|purchasingButtonTokens|panelUiStatusSettingsStyles|warehouseUiSkin|WarehouseCardButton|AppButton)/;

const DS_IMPORT_RE = /from\s+['"][^'"]*design-system[^'"]*['"]/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(SRC);
let dsImportFiles = 0;
let facadeImportFiles = 0;
let magicHits = 0;
let magicFiles = 0;
let tsxOutsideDs = 0;
let componentsLikelyNeedingMigration = 0;

const facadeHits = {};

for (const file of files) {
  const rel = path.relative(SRC, file).replace(/\\/g, "/");
  const inDs = rel.startsWith("design-system/");
  const text = fs.readFileSync(file, "utf8");

  if (!inDs && /\.(tsx)$/.test(file)) tsxOutsideDs += 1;

  if (DS_IMPORT_RE.test(text)) dsImportFiles += 1;

  if (FACADE_RE.test(text) && !inDs) {
    // count import-like usage
    const importLines = text.split("\n").filter((l) => /import\s|from\s+['"]/.test(l) && FACADE_RE.test(l));
    if (importLines.length || /AppButton|filterUiTokens|listSellasistTokens|wmsOperationalUi|warehouseMaterialsUi|purchasingButtonTokens|panelUiStatusSettingsStyles|warehouseUiSkin/.test(text)) {
      facadeImportFiles += 1;
      for (const name of [
        "filterUiTokens",
        "listSellasistTokens",
        "wmsOperationalUi",
        "warehouseMaterialsUi",
        "purchasingButtonTokens",
        "panelUiStatusSettingsStyles",
        "warehouseUiSkin",
        "AppButton",
      ]) {
        if (text.includes(name)) facadeHits[name] = (facadeHits[name] || 0) + 1;
      }
    }
  }

  if (!inDs) {
    const matches = text.match(MAGIC_RE);
    if (matches?.length) {
      magicHits += matches.length;
      magicFiles += 1;
      if (/\.(tsx)$/.test(file) && /className|rounded-|shadow-|bg-orange|h-10/.test(text)) {
        componentsLikelyNeedingMigration += 1;
      }
    }
  }
}

const migratedShare = dsImportFiles / Math.max(dsImportFiles + facadeImportFiles, 1);
// Rough completion: files with DS imports vs files with magic classes (proxy)
const completionPct = Math.round(
  (dsImportFiles / Math.max(dsImportFiles + magicFiles * 0.15, 1)) * 100,
);

const report = {
  generatedAt: new Date().toISOString(),
  designSystemImportFiles: dsImportFiles,
  facadeImportFiles,
  facadeBreakdown: facadeHits,
  magicClassOccurrencesOutsideDs: magicHits,
  magicClassFilesOutsideDs: magicFiles,
  tsxFilesOutsideDs: tsxOutsideDs,
  componentsLikelyNeedingMigration,
  estimatedMigrationCompletionPercent: Math.min(completionPct, 99),
  note: "Completion is a heuristic (DS imports vs remaining magic). Full visual parity requires module-by-module migration.",
};

const outPath = path.resolve(__dirname, "../../memory/ui-kit-hardening-report.md");
const md = `# Sasist UI Kit — hardening metrics

Generated: ${report.generatedAt}

| Metryka | Wartość |
|---------|---------|
| Pliki z importem \`design-system\` | **${report.designSystemImportFiles}** |
| Pliki z fasadami / AppButton | **${report.facadeImportFiles}** |
| Wystąpienia magicznych klas (poza DS) | **${report.magicClassOccurrencesOutsideDs}** |
| Pliki z magicznymi klasami (poza DS) | **${report.magicClassFilesOutsideDs}** |
| TSX poza design-system | **${report.tsxFilesOutsideDs}** |
| Komponenty do migracji (heurystyka) | **${report.componentsLikelyNeedingMigration}** |
| Szacunkowy % ukończenia migracji | **${report.estimatedMigrationCompletionPercent}%** |

## Fasady (pliki zawierające nazwę)

${Object.entries(facadeHits)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- \`${k}\`: ${v}`)
  .join("\n") || "_brak_"}

## Usunięte w Etapie 3

- \`WarehouseCardButton.tsx\` (0 konsumentów)

## Egzekwowanie

- ESLint plugin \`sasist-ui-kit\`: \`no-magic-tailwind\` (warn), \`no-local-ui-token-file\` (error), \`no-deprecated-facade-import\` (warn)
- Playground: \`/design-system\`
- Density: \`compact | default | comfortable\` na Button / Card / Input / Segmented / Status / ListTile / MetricCard

## Gotowość UI Kit: **7/10**

Do 10/10: przepiąć listy ERP + WMS z fasad, wyzerować magic Tailwind przy touch, \`no-deprecated-facade-import\` → error, usunąć pozostałe fasady.
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`\nWrote ${outPath}`);
