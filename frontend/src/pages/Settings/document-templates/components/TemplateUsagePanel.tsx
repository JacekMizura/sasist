import { useCallback, useEffect, useState } from "react";

import {
  fetchTemplateUsage,
  type TemplateAssignmentItem,
  type TemplateUsageBadge,
} from "../../../../api/documentTemplatesApi";
import { DEFAULT_TENANT_ID } from "../constants";
import { kindLabel } from "../utils/assignableDocumentKinds";
import { TemplateAssignmentModal } from "./TemplateAssignmentModal";

type Props = {
  templateId: number;
  templateKindCode: string | null;
  publishedVersionId: number | null;
  onAssignmentsChange?: () => void;
};

export function TemplateUsagePanel({
  templateId,
  templateKindCode,
  publishedVersionId,
  onAssignmentsChange,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TemplateAssignmentItem[]>([]);
  const [badges, setBadges] = useState<TemplateUsageBadge[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTemplateUsage(DEFAULT_TENANT_ID, templateId);
      setItems(data.items);
      setBadges(data.badges);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const assignedLabels = uniqueKindLabels(items);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Przypisania szablonu</h3>
        <p className="mt-1 text-xs text-slate-500">Określ, które dokumenty ERP korzystają z tego wydruku.</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Wczytywanie przypisań…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
          <p className="text-sm text-slate-700">
            Ten szablon nie jest jeszcze przypisany do żadnego dokumentu.
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            onClick={() => setModalOpen(true)}
          >
            Przypisz szablon
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {assignedLabels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900"
              >
                <span aria-hidden>✓</span> {label}
              </span>
            ))}
          </div>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {items.map((item, idx) => (
              <li key={`${item.scope_type}-${item.scope_id}-${idx}`} className="px-3 py-3 text-sm">
                <div className="font-medium text-slate-900">
                  {item.kind_name || kindLabel(item.kind_code) || item.scope_label}
                </div>
                <div className="text-xs text-slate-500">
                  {item.scope_type_label}
                  {item.scope_label ? ` · ${item.scope_label}` : ""}
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            onClick={() => setModalOpen(true)}
          >
            Zmień przypisania
          </button>
        </>
      )}

      <TemplateAssignmentModal
        templateId={templateId}
        templateKindCode={templateKindCode}
        publishedVersionId={publishedVersionId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void load();
          onAssignmentsChange?.();
        }}
      />
    </div>
  );
}

function uniqueKindLabels(items: TemplateAssignmentItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const label = (item.kind_name || kindLabel(item.kind_code) || item.scope_label || "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}
