import { useMemo, useState } from "react";

import type { EditorContextDto } from "../../../../api/documentTemplatesApi";
import { kindLabel } from "../utils/assignableDocumentKinds";
import { TemplateAssignmentModal } from "./TemplateAssignmentModal";

type Props = {
  ctx: EditorContextDto;
  onAssignmentsChange?: () => void;
};

export function TemplateAssignmentsStrip({ ctx, onAssignmentsChange }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const labels = useMemo(() => collectAssignedLabels(ctx), [ctx]);
  const publishedVersionId =
    ctx.detail.published_version?.id ?? ctx.detail.draft_version?.id ?? null;

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-slate-500">Przypisany do:</span>
        {labels.length ? (
          <button
            type="button"
            className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-left text-slate-800 hover:text-blue-800"
            onClick={() => setModalOpen(true)}
          >
            {labels.map((label) => (
              <span key={label} className="inline-flex items-center gap-1">
                <span className="text-emerald-600" aria-hidden>
                  ✓
                </span>
                {label}
              </span>
            ))}
          </button>
        ) : (
          <button
            type="button"
            className="font-medium text-amber-800 underline decoration-dotted hover:text-amber-900"
            onClick={() => setModalOpen(true)}
          >
            Nieprzypisany
          </button>
        )}
      </div>
      <TemplateAssignmentModal
        templateId={ctx.detail.id}
        templateKindCode={ctx.detail.kind?.code ?? null}
        publishedVersionId={publishedVersionId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={onAssignmentsChange}
      />
    </>
  );
}

function collectAssignedLabels(ctx: EditorContextDto): string[] {
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
