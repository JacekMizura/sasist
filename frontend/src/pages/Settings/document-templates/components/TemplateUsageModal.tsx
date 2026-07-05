import { Link } from "react-router-dom";

import type { TemplateAssignmentItem, TemplateUsageBadge } from "@/api/documentTemplatesApi";

type Props = {
  templateName: string;
  badges: TemplateUsageBadge[];
  items: TemplateAssignmentItem[];
  onClose: () => void;
};

export function TemplateUsageModal({ templateName, badges, items, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Użycia: {templateName}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {badges.map((b) => (
                <span key={b.label} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {b.label} ({b.count})
                </span>
              ))}
            </div>
          </div>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <ul className="mt-5 divide-y divide-slate-100">
          {items.length === 0 ? (
            <li className="py-6 text-center text-sm text-slate-500">Brak przypisań.</li>
          ) : (
            items.map((item, idx) => (
              <li key={`${item.scope_type}-${item.scope_id}-${idx}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-medium text-slate-900">{item.scope_label}</div>
                  <div className="text-xs text-slate-500">
                    {item.scope_type_label}
                    {item.kind_name ? ` · ${item.kind_name}` : ""}
                  </div>
                </div>
                {item.erp_link ? (
                  <Link to={item.erp_link} className="text-xs font-medium text-blue-700 hover:underline">
                    Otwórz
                  </Link>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
