import { useMemo } from "react";
import type { TemplateElement, VariableCategoryId } from "../../../types/labelSystem";
import { LABEL_VARIABLE_CATEGORIES } from "../../../types/labelSystem";
import { UI_STRINGS } from "../../../constants/uiStrings";
import type { VariableUsage } from "../../../labelSystem/variableAnalysis/analyzeTemplateVariables";
import type { VariablePreview } from "../../../labelSystem/variableAnalysis/resolvePreviewVariables";
import type { TemplateVariableAnalysis } from "../../../labelSystem/variableAnalysis/analyzeTemplateVariables";
import {
  filterWarehouseVariablesForGroupedLocation,
  formatGroupedLocationDataPreview,
  groupedElementSlotArrowLabel,
  partitionGroupedWarehouseItems,
} from "../../../labelSystem/locationGroupedVariables";
import {
  CalendarClock,
  ClipboardList,
  Euro,
  Factory,
  Image as ImageLucide,
  Package,
  Ruler,
  ScanBarcode,
  Shield,
  ShoppingBasket,
  ShoppingCart,
  Truck,
  Type,
  Warehouse,
} from "lucide-react";

const ROOT_VAR_SECTION_ORDER: (VariableCategoryId | "other")[] = [
  "warehouse",
  "cart",
  "basket",
  "fleet",
  "orders",
  "product_basic",
  "product_pricing",
  "product_logistics",
  "product_batch",
  "product_origin",
  "product_regulations",
  "product_media",
  "other",
];

function SectionMiniIcon({ id }: { id: VariableCategoryId | "other" }) {
  const c = "h-3.5 w-3.5 shrink-0 text-slate-500";
  switch (id) {
    case "warehouse":
      return <Warehouse className={c} strokeWidth={2} aria-hidden />;
    case "cart":
      return <ShoppingCart className={c} strokeWidth={2} aria-hidden />;
    case "basket":
      return <ShoppingBasket className={c} strokeWidth={2} aria-hidden />;
    case "fleet":
      return <Truck className={c} strokeWidth={2} aria-hidden />;
    case "orders":
      return <ClipboardList className={c} strokeWidth={2} aria-hidden />;
    case "product_basic":
      return <Package className={c} strokeWidth={2} aria-hidden />;
    case "product_pricing":
      return <Euro className={c} strokeWidth={2} aria-hidden />;
    case "product_logistics":
      return <Ruler className={c} strokeWidth={2} aria-hidden />;
    case "product_batch":
      return <CalendarClock className={c} strokeWidth={2} aria-hidden />;
    case "product_origin":
      return <Factory className={c} strokeWidth={2} aria-hidden />;
    case "product_regulations":
      return <Shield className={c} strokeWidth={2} aria-hidden />;
    case "product_media":
      return <ImageLucide className={c} strokeWidth={2} aria-hidden />;
    default:
      return <Type className={c} strokeWidth={2} aria-hidden />;
  }
}

export type VariableInspectorPanelProps = {
  analysis: {
    rootVariables: TemplateVariableAnalysis["rootVariables"];
    datasets: TemplateVariableAnalysis["datasets"];
    previewVariables: VariablePreview[];
  };
  /** When a repeater is selected, show hint to drop variables into its dataset. */
  selected?: TemplateElement | null;
  /** Location + CSV merged preview: split „Podgląd danych” / „Zmienne do etykiety”. */
  groupedLocationInspector?: boolean;
  /** Sample record for grouped data preview (same as canvas preview). */
  previewRecord?: Record<string, unknown> | null;
};

function tokenForPreview(p: VariablePreview): string {
  const t = p.name.trim();
  return t.startsWith("{") && t.endsWith("}") ? t : `{${t}}`;
}

function bareVariableName(name: string): string {
  const t = name.trim();
  return t.startsWith("{") && t.endsWith("}") ? t.slice(1, -1).trim() : t;
}

function setVariableDragData(e: React.DragEvent, token: string, dataset?: string) {
  e.dataTransfer.setData(
    "application/x-label-variable",
    JSON.stringify({ name: token, dataset: dataset ?? undefined }),
  );
  e.dataTransfer.setData("text/plain", token);
  e.dataTransfer.effectAllowed = "copy";
}

const GROUPED_INSPECTOR_CATALOG_BARE = new Set([
  "row",
  "rack_name",
  "floor_1",
  "floor_2",
  "floor_3",
  "barcode_1",
  "barcode_2",
  "barcode_3",
  "loc_name_1",
  "loc_name_2",
  "loc_name_3",
]);

export function VariableInspectorPanel({
  analysis,
  selected = null,
  groupedLocationInspector = false,
  previewRecord = null,
}: VariableInspectorPanelProps) {
  const { rootVariables, datasets, previewVariables } = analysis;
  const byKey = new Map<string, VariablePreview>();
  for (const p of previewVariables) {
    const key = p.dataset != null ? `${p.dataset}:${p.name}` : p.name;
    byKey.set(key, p);
  }
  const unresolved = previewVariables.filter((p) => !p.resolved);
  const selectedRepeater = selected?.type === "repeater" ? selected : null;
  const repeaterDataset = selectedRepeater && "dataset" in selectedRepeater ? selectedRepeater.dataset : null;

  const warehouseDef = LABEL_VARIABLE_CATEGORIES.find((c) => c.id === "warehouse");
  const groupedPaletteItems = warehouseDef
    ? filterWarehouseVariablesForGroupedLocation(warehouseDef.items)
    : [];
  const { common: groupedCommon, elements: groupedElements, other: groupedOtherPalette } =
    partitionGroupedWarehouseItems(groupedPaletteItems);

  const otherRootInTemplate = groupedLocationInspector
    ? rootVariables.filter((v) => !GROUPED_INSPECTOR_CATALOG_BARE.has(bareVariableName(v.name)))
    : [];

  const showGroupedLayout = Boolean(groupedLocationInspector);
  const dataPreviewSource = previewRecord ?? {};

  const bareToPalette = useMemo(() => {
    const m = new Map<string, { cat: VariableCategoryId; label: string }>();
    for (const cat of LABEL_VARIABLE_CATEGORIES) {
      for (const it of cat.items) {
        const bare = bareVariableName(it.token);
        m.set(bare, { cat: cat.id, label: it.label });
      }
    }
    return m;
  }, []);

  const rootBuckets = useMemo(() => {
    const buckets = new Map<VariableCategoryId | "other", VariableUsage[]>();
    for (const v of rootVariables) {
      const bare = bareVariableName(v.name);
      const meta = bareToPalette.get(bare);
      const key: VariableCategoryId | "other" = meta?.cat ?? "other";
      const list = buckets.get(key) ?? [];
      list.push(v);
      buckets.set(key, list);
    }
    return buckets;
  }, [rootVariables, bareToPalette]);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Inspektor zmiennych</h3>
      {repeaterDataset && (
        <p className="rounded-lg border border-cyan-100 bg-cyan-50 px-2 py-1.5 text-[10px] text-slate-600">
          Upuść zmienne tutaj, aby wstawić je do zbioru danych „{repeaterDataset}”.
        </p>
      )}

      {showGroupedLayout ? (
        <>
          <section>
            <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">
              Podgląd danych
            </h4>
            <div className="rounded-lg border border-slate-100 bg-slate-50/90 px-3 py-2 text-[11px] text-slate-800 leading-relaxed">
              {(() => {
                const { rackText, rowText, floorLines } = formatGroupedLocationDataPreview(dataPreviewSource);
                return (
                  <>
                    <p>
                      <span className="font-semibold text-slate-600">Regał:</span> {rackText}
                    </p>
                    <p>
                      <span className="font-semibold text-slate-600">Rząd:</span> {rowText}
                    </p>
                    <p className="mt-1.5 font-semibold text-slate-600">Piętra:</p>
                    {floorLines.length === 0 ? (
                      <p className="text-slate-500 pl-1">—</p>
                    ) : (
                      <ul className="list-disc pl-5 mt-0.5 space-y-0.5">
                        {floorLines.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </>
                );
              })()}
            </div>
          </section>

          <section>
            <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">
              Zmienne do etykiety
            </h4>
            <div className="border border-slate-100 rounded-lg overflow-hidden divide-y divide-slate-100 bg-white">
              <div className="px-3 py-2 bg-slate-50/80">
                <p className="text-[10px] font-semibold text-slate-600 mb-1.5">Dane wspólne</p>
                <div className="flex flex-col gap-1">
                  {groupedCommon.map((v) => (
                    <div
                      key={v.id}
                      draggable
                      onDragStart={(e) => {
                        setVariableDragData(e, v.token);
                      }}
                      className="px-2 py-1.5 rounded-md border border-transparent hover:border-cyan-200 hover:bg-slate-50 cursor-grab active:cursor-grabbing font-mono text-[11px] text-slate-700"
                      title={`Przeciągnij na etykietę: ${v.token}`}
                    >
                      <span className="font-medium text-slate-800">{v.label}</span>
                      <span className="block font-mono text-[9px] text-slate-500">{v.token}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="px-3 py-2">
                <p className="text-[10px] font-semibold text-slate-600 mb-1.5">Elementy etykiety</p>
                <div className="flex flex-col gap-1">
                  {groupedElements.map((v) => {
                    const arrow = groupedElementSlotArrowLabel(v.id);
                    return (
                      <div
                        key={v.id}
                        draggable
                        onDragStart={(e) => {
                          setVariableDragData(e, v.token);
                        }}
                        className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border border-transparent hover:border-cyan-200 hover:bg-slate-50 cursor-grab active:cursor-grabbing"
                        title={`Przeciągnij na etykietę: ${v.token}`}
                      >
                        <span className="text-[11px] text-slate-800 shrink-0">{arrow}</span>
                        <span className="text-[10px] text-slate-700 truncate min-w-0 text-right">
                          <span className="font-medium">{v.label}</span>
                          <span className="block font-mono text-[9px] text-slate-500">{v.token}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {groupedOtherPalette.length > 0 && (
                <div className="px-3 py-2 bg-slate-50/50">
                  <p className="text-[10px] font-semibold text-slate-600 mb-1.5">Inne</p>
                  <div className="flex flex-col gap-1">
                    {groupedOtherPalette.map((v) => (
                      <div
                        key={v.id}
                        draggable
                        onDragStart={(e) => setVariableDragData(e, v.token)}
                        className="px-2 py-1.5 rounded-md font-mono text-[11px] text-slate-700 hover:bg-white border border-transparent hover:border-cyan-200 cursor-grab"
                        title={`Przeciągnij: ${v.token}`}
                      >
                        <span className="font-medium text-slate-800">{v.label}</span>
                        <span className="block font-mono text-[9px] text-slate-500">{v.token}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {otherRootInTemplate.length > 0 && (
              <div className="mt-2 rounded-lg border border-slate-100 overflow-hidden divide-y divide-slate-100">
                <div className="px-2 py-1.5 bg-slate-50 text-[10px] font-semibold text-slate-600">
                  Zmienne w szablonie (poza listą)
                </div>
                {otherRootInTemplate.map((v) => {
                  const key = v.name;
                  const prev = byKey.get(key);
                  const resolved = prev?.resolved ?? false;
                  const value = prev?.resolvedValue ?? "";
                  const token = tokenForPreview(
                    prev ?? { name: v.name, type: v.type, resolvedValue: "", resolved: false },
                  );
                  return (
                    <div
                      key={v.elementId}
                      draggable
                      onDragStart={(e) => setVariableDragData(e, token)}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-mono bg-white hover:bg-slate-50 cursor-grab"
                      title={token}
                    >
                      <span className="text-slate-700 truncate min-w-0">{v.name}</span>
                      <span className="shrink-0 text-slate-500">{resolved ? `✓ ${value}` : "⚠"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <section>
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Zmienne główne</h4>
          {rootVariables.length === 0 ? (
            <div className="rounded-lg border border-slate-100 px-3 py-2 text-[11px] text-slate-400">— brak —</div>
          ) : (
            <div className="space-y-2">
              {ROOT_VAR_SECTION_ORDER.map((sectionId) => {
                const vars = rootBuckets.get(sectionId);
                if (!vars?.length) return null;
                const title =
                  sectionId === "other"
                    ? "Inne"
                    : (UI_STRINGS.labels.categories as Record<string, string>)[sectionId] ??
                      LABEL_VARIABLE_CATEGORIES.find((c) => c.id === sectionId)?.label ??
                      sectionId;
                return (
                  <div key={sectionId} className="rounded-lg border border-slate-100 bg-slate-50/50 overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-slate-100 bg-white/90 px-2.5 py-1.5">
                      <SectionMiniIcon id={sectionId} />
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">{title}</span>
                    </div>
                    <div className="divide-y divide-slate-100 bg-white">
                      {vars.map((v) => {
                        const key = v.name;
                        const prev = byKey.get(key);
                        const resolved = prev?.resolved ?? false;
                        const value = prev?.resolvedValue ?? "";
                        const token = tokenForPreview(
                          prev ?? { name: v.name, type: v.type, resolvedValue: "", resolved: false },
                        );
                        const bare = bareVariableName(v.name);
                        const friendly = bareToPalette.get(bare)?.label ?? bare;
                        const TypeIcon = v.type === "barcode" ? ScanBarcode : v.type === "image" ? ImageLucide : Type;
                        return (
                          <div
                            key={v.elementId}
                            draggable
                            onDragStart={(e) => {
                              setVariableDragData(e, token);
                            }}
                            className="group flex items-start gap-2 px-3 py-2.5 text-[11px] bg-white hover:bg-slate-50/90 cursor-grab active:cursor-grabbing border-l-2 border-transparent hover:border-cyan-200"
                            title={`Przeciągnij na etykietę: ${token}`}
                          >
                            <TypeIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-slate-600" strokeWidth={2} aria-hidden />
                            <div className="min-w-0 flex-1">
                              <span className="block font-medium text-slate-900 leading-snug">{friendly}</span>
                              <span className="block font-mono text-[9px] text-slate-500 mt-0.5">{token}</span>
                            </div>
                            <span
                              className="shrink-0 text-[10px] text-slate-500 max-w-[40%] truncate"
                              title={value || (resolved ? undefined : "Brak wartości w danych podglądu")}
                            >
                              {resolved ? `✓ ${value}` : "⚠"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {(!groupedLocationInspector || datasets.length > 0) && (
        <section>
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Zbiory danych (datasets)</h4>
          <div className="border border-slate-100 rounded-lg overflow-hidden divide-y divide-slate-100">
            {datasets.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-slate-400">— brak —</div>
            ) : (
              datasets.map((ds) => (
                <div key={ds.name} className="bg-slate-50/80">
                  <div className="px-3 py-2 text-[11px] font-semibold text-slate-600 border-b border-slate-100">
                    {ds.name}[]
                  </div>
                  <div className="divide-y divide-slate-100">
                    {ds.variables.map((v) => {
                      const key = `${ds.name}:${v.name}`;
                      const prev = byKey.get(key);
                      const resolved = prev?.resolved ?? false;
                      const value = prev?.resolvedValue ?? "";
                      const token = tokenForPreview(
                        prev ?? {
                          name: v.name,
                          type: v.type,
                          resolvedValue: "",
                          resolved: false,
                          dataset: ds.name,
                        },
                      );
                      return (
                        <div
                          key={v.elementId}
                          draggable
                          onDragStart={(e) => {
                            setVariableDragData(e, token, ds.name);
                          }}
                          className="flex items-center justify-between gap-2 pl-5 pr-3 py-1.5 text-[11px] font-mono bg-white hover:bg-slate-50 cursor-grab active:cursor-grabbing border-l-2 border-transparent hover:border-cyan-200"
                          title={`Przeciągnij na etykietę: ${token}`}
                        >
                          <span className="text-slate-700 truncate min-w-0">{v.name}</span>
                          <span
                            className="shrink-0 text-slate-500"
                            title={value || (resolved ? undefined : "Brak wartości w danych podglądu")}
                          >
                            {resolved ? `✓ ${value}` : "⚠"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {unresolved.length > 0 && (
        <section>
          <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">
            Brak danych
          </h4>
          <div className="border border-amber-100 rounded-lg overflow-hidden divide-y divide-amber-100 bg-amber-50/50">
            {unresolved.map((p) => {
              const token = tokenForPreview(p);
              return (
                <div
                  key={p.dataset != null ? `${p.dataset}:${p.name}` : p.name}
                  draggable
                  onDragStart={(e) => {
                    setVariableDragData(e, token, p.dataset);
                  }}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-mono hover:bg-amber-50 cursor-grab active:cursor-grabbing"
                  title={`Przeciągnij na etykietę: ${token}`}
                >
                  <span className="text-slate-700">{p.name}</span>
                  <span className="shrink-0 text-amber-600" title="Nie znaleziono w danych podglądu">
                    ⚠ nie znaleziono
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            ⚠ nie znaleziono zmiennej w danych podglądu
          </p>
        </section>
      )}
    </div>
  );
}
