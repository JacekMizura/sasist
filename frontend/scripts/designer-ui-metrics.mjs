import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve("src");
const MAGIC =
  /\b(?:rounded-(?:xl|lg|md)|shadow-(?:sm|lg)|h-(?:8|9|10)|bg-orange-\S+|text-orange-\S+)\b/g;
const DS = /from\s+['"][^'"]*design-system[^'"]*['"]/;

const roots = [
  "pages/WarehouseDesigner",
  "pages/WarehouseDesigner.tsx",
  "components/warehouse/RackSidebar.tsx",
  "components/warehouse/RackPropertiesSidebar.tsx",
  "components/warehouse/WarehouseCanvas.tsx",
  "components/warehouse/WarehouseMainView.tsx",
  "components/warehouse/ElevationSidePanel.tsx",
  "components/warehouse/WarehouseZoomControls.tsx",
  "components/warehouse/WarehouseModals.tsx",
  "components/warehouse/WarehouseShell.tsx",
  "components/warehouse/TemplateCreator.tsx",
  "components/warehouse/GenerateWarehouseLayoutModal.tsx",
  "components/warehouse/RowPrefixModal.tsx",
  "components/warehouse/InternalLayoutModal.tsx",
  "components/warehouse/StructureRebuildConfirmDialog.tsx",
];

function walk(p, out = []) {
  if (!fs.existsSync(p)) return out;
  const st = fs.statSync(p);
  if (st.isFile()) {
    if (/\.(tsx?)$/.test(p)) out.push(p);
    return out;
  }
  for (const e of fs.readdirSync(p)) {
    if (e === "node_modules") continue;
    walk(path.join(p, e), out);
  }
  return out;
}

const files = [];
for (const r of roots) walk(path.join(SRC, r), files);

let magic = 0;
let magicFiles = 0;
let ds = 0;
const per = {};
for (const f of files) {
  const t = fs.readFileSync(f, "utf8");
  if (DS.test(t)) ds += 1;
  const m = t.match(MAGIC);
  if (m) {
    magic += m.length;
    magicFiles += 1;
    per[path.relative(SRC, f).replace(/\\/g, "/")] = m.length;
  }
}

console.log(
  JSON.stringify(
    {
      files: files.length,
      dsImportFiles: ds,
      magicHits: magic,
      magicFiles,
      top: Object.entries(per)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15),
    },
    null,
    2,
  ),
);
