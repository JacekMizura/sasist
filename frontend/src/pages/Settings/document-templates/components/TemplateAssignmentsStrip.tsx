import { useMemo } from "react";

import type { EditorContextDto } from "../../../../api/documentTemplatesApi";
import { kindLabel } from "../utils/assignableDocumentKinds";

type Props = {
  ctx: EditorContextDto;
  onOpenAssignments?: () => void;
};

export function TemplateAssignmentsStrip({ ctx, onOpenAssignments }: Props) {
  const labels = useMemo(() => collectAssignedLabels(ctx), [ctx]);

  return (
    <button
      type="button"
      className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-left text-sm hover:opacity-80"
      onClick={onOpenAssignments}
    >
      <span className="text-slate-500">Przypisany do:</span>
      {labels.length ? (
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-800">
          {labels.map((label) => (
            <span key={label} className="inline-flex items-center gap-1">
              <span className="text-emerald-600" aria-hidden>
                ✓
              </span>
              {label}
            </span>
          ))}
        </span>
      ) : (
        <span className="font-medium text-amber-800 underline decoration-dotted">Nieprzypisany</span>
      )}
    </button>
  );
}

function collectAssignedLabels(ctx: EditorContextDto): string[] {
  const fromKinds = (ctx.kind_assignments ?? []).filter((a) => a.assigned).map((a) => a.kind_name);
  if (fromKinds.length) return fromKinds;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of ctx.erp_assignments ?? []) {
    const label = (item.kind_name || kindLabel(item.kind_code) || "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}
