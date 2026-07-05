import { Link } from "react-router-dom";

import type { TemplateAssignmentItem } from "@/api/documentTemplatesApi";

type Props = {
  items: TemplateAssignmentItem[];
};

export function TemplateAssignmentsPanel({ items }: Props) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Przypisania</h3>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">Ten szablon nie jest jeszcze przypisany w ERP.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {items.map((item, idx) => (
            <li key={`${item.scope_type}-${item.scope_id}-${idx}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <div className="font-medium text-slate-800">{item.scope_label}</div>
                <div className="text-[11px] text-slate-500">{item.scope_type_label}</div>
              </div>
              {item.erp_link ? (
                <Link to={item.erp_link} className="text-[11px] font-medium text-blue-700 hover:underline">
                  Przejdź
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
