import { useMemo, useState } from "react";

import type { EditorContextDto, TemplateAssignmentItem } from "../../../../api/documentTemplatesApi";
import { AssignmentConfigModal } from "./AssignmentConfigModal";

type Props = {
  ctx: EditorContextDto;
  onOpenAssignmentsTab?: () => void;
};

type AssignmentGroup = {
  label: string;
  items: TemplateAssignmentItem[];
};

export function TemplateAssignmentsStrip({ ctx, onOpenAssignmentsTab }: Props) {
  const groups = useMemo(() => buildAssignmentGroups(ctx), [ctx]);
  const [activeGroup, setActiveGroup] = useState<AssignmentGroup | null>(null);

  if (!groups.length) {
    return (
      <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        <span className="text-slate-600">Użycia:</span> Brak przypisań
      </div>
    );
  }

  return (
    <>
      <div className="border-t border-slate-100 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-600">Użycia:</span>
          {groups.map((group) => (
            <button
              key={group.label}
              type="button"
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900"
              onClick={() => setActiveGroup(group)}
            >
              {group.label}
            </button>
          ))}
        </div>
      </div>
      {activeGroup ? (
        <AssignmentConfigModal
          label={activeGroup.label}
          items={activeGroup.items}
          onClose={() => setActiveGroup(null)}
          onOpenAssignmentsTab={onOpenAssignmentsTab}
        />
      ) : null}
    </>
  );
}

function buildAssignmentGroups(ctx: EditorContextDto): AssignmentGroup[] {
  const map = new Map<string, TemplateAssignmentItem[]>();
  const items = ctx.erp_assignments ?? [];

  for (const item of items) {
    const label = (item.kind_name || item.scope_label || item.scope_type_label || "Przypisanie").trim();
    const list = map.get(label) ?? [];
    list.push(item);
    map.set(label, list);
  }

  if (map.size) {
    return [...map.entries()].map(([label, groupItems]) => ({ label, items: groupItems }));
  }

  for (const b of ctx.bindings ?? []) {
    const label = (b.kind_name || b.kind_code || "").trim();
    if (!label) continue;
    map.set(label, []);
  }

  return [...map.entries()].map(([label]) => ({
    label,
    items: items.filter((i) => (i.kind_name || i.scope_label) === label),
  }));
}
