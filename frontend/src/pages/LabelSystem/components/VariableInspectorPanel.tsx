import type { TemplateElement } from "../../../types/labelSystem";
import type { VariablePreview } from "../../../labelSystem/variableAnalysis/resolvePreviewVariables";
import type { TemplateVariableAnalysis } from "../../../labelSystem/variableAnalysis/analyzeTemplateVariables";

export type VariableInspectorPanelProps = {
  analysis: {
    rootVariables: TemplateVariableAnalysis["rootVariables"];
    datasets: TemplateVariableAnalysis["datasets"];
    previewVariables: VariablePreview[];
  };
  /** When a repeater is selected, show hint to drop variables into its dataset. */
  selected?: TemplateElement | null;
};

function tokenForPreview(p: VariablePreview): string {
  const t = p.name.trim();
  return t.startsWith("{") && t.endsWith("}") ? t : `{${t}}`;
}

function setVariableDragData(e: React.DragEvent, token: string, dataset?: string) {
  e.dataTransfer.setData(
    "application/x-label-variable",
    JSON.stringify({ name: token, dataset: dataset ?? undefined })
  );
  e.dataTransfer.setData("text/plain", token);
  e.dataTransfer.effectAllowed = "copy";
}

export function VariableInspectorPanel({ analysis, selected = null }: VariableInspectorPanelProps) {
  const { rootVariables, datasets, previewVariables } = analysis;
  const byKey = new Map<string, VariablePreview>();
  for (const p of previewVariables) {
    const key = p.dataset != null ? `${p.dataset}:${p.name}` : p.name;
    byKey.set(key, p);
  }
  const unresolved = previewVariables.filter((p) => !p.resolved);
  const selectedRepeater = selected?.type === "repeater" ? selected : null;
  const repeaterDataset = selectedRepeater && "dataset" in selectedRepeater ? selectedRepeater.dataset : null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-black uppercase tracking-wide text-slate-600">
        Variable Inspector
      </h3>
      {repeaterDataset && (
        <p className="text-[10px] text-slate-500 rounded-lg bg-cyan-50 border border-cyan-100 px-2 py-1.5">
          Drop variables here to insert into dataset &quot;{repeaterDataset}&quot;
        </p>
      )}

      <section>
        <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">
          Root variables
        </h4>
        <div className="border border-slate-100 rounded-lg overflow-hidden divide-y divide-slate-100">
          {rootVariables.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-slate-400">— none —</div>
          ) : (
            rootVariables.map((v) => {
              const key = v.name;
              const prev = byKey.get(key);
              const resolved = prev?.resolved ?? false;
              const value = prev?.resolvedValue ?? "";
              const token = tokenForPreview(prev ?? { name: v.name, type: v.type, resolvedValue: "", resolved: false });
              return (
                <div
                  key={v.elementId}
                  draggable
                  onDragStart={(e) => {
                    setVariableDragData(e, token);
                  }}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-mono bg-white hover:bg-slate-50 cursor-grab active:cursor-grabbing border-l-2 border-transparent hover:border-cyan-200"
                  title={`Przeciągnij na etykietę: ${token}`}
                >
                  <span className="text-slate-700 truncate min-w-0">{v.name}</span>
                  <span className="shrink-0 text-slate-500" title={value || (resolved ? undefined : "variable not found in preview data")}>
                    {resolved ? `✓ ${value}` : "⚠"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section>
        <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">
          Datasets
        </h4>
        <div className="border border-slate-100 rounded-lg overflow-hidden divide-y divide-slate-100">
          {datasets.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-slate-400">— none —</div>
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
                    const token = tokenForPreview(prev ?? { name: v.name, type: v.type, resolvedValue: "", resolved: false, dataset: ds.name });
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
                        <span className="shrink-0 text-slate-500" title={value || (resolved ? undefined : "variable not found in preview data")}>
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

      {unresolved.length > 0 && (
        <section>
          <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">
            Unresolved
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
                  <span className="shrink-0 text-amber-600" title="variable not found in preview data">
                    ⚠ missing
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            ⚠ variable not found in preview data
          </p>
        </section>
      )}
    </div>
  );
}
