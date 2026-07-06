import { Link } from "react-router-dom";

import type { TemplateAssignmentItem } from "../../../../api/documentTemplatesApi";

type Props = {
  label: string;
  items: TemplateAssignmentItem[];
  onClose: () => void;
  onOpenAssignmentsTab?: () => void;
};

export function AssignmentConfigModal({ label, items, onClose, onOpenAssignmentsTab }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Przypisanie: {label}</h2>
          <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100" onClick={onClose}>
            ✕
          </button>
        </div>
        <ul className="divide-y divide-slate-100 px-4 py-2">
          {items.map((item, idx) => (
            <li key={`${item.scope_type}-${item.scope_id}-${idx}`} className="py-3 text-sm">
              <div className="font-medium text-slate-900">{item.scope_label}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {item.scope_type_label}
                {item.kind_name ? ` · ${item.kind_name}` : ""}
                {item.extra ? ` · ${item.extra}` : ""}
              </div>
              {item.erp_link ? (
                <Link to={item.erp_link} className="mt-2 inline-block text-xs font-medium text-blue-700 hover:underline">
                  Konfiguruj w ERP →
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
          {onOpenAssignmentsTab ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
              onClick={() => {
                onOpenAssignmentsTab();
                onClose();
              }}
            >
              Wszystkie przypisania
            </button>
          ) : null}
          <button type="button" className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white" onClick={onClose}>
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
