import {
  DOCUMENT_PRINT_MODULE_TYPE_LABELS,
  DOCUMENT_PRINT_MODULE_TYPE_ORDER,
  LABEL_PRINT_MODULE_TYPE_LABELS,
  LABEL_PRINT_MODULE_TYPE_ORDER,
} from "../labelPrintModuleTypes";
import { getTypeIcon, UNGROUPED_ID, type GroupRow } from "./templatesListTypes";

type Props = {
  selectedType: string;
  onSelectType: (type: string) => void;
  selectedGroupId: string | number | null;
  onSelectGroup: (id: string | number | null) => void;
  groups: GroupRow[];
  newGroupName: string;
  onNewGroupNameChange: (v: string) => void;
  onCreateGroup: () => void;
  creatingGroup: boolean;
};

/**
 * Inner left rail for Szablony — label types + groups (250–280px).
 * Does not touch the app sidebar.
 */
export default function TemplatesListSidebar({
  selectedType,
  onSelectType,
  selectedGroupId,
  onSelectGroup,
  groups,
  newGroupName,
  onNewGroupNameChange,
  onCreateGroup,
  creatingGroup,
}: Props) {
  const typeBtn = (type: string, label: string) => {
    const active = selectedType === type;
    return (
      <button
        key={type}
        type="button"
        onClick={() => onSelectType(type)}
        className={[
          "group flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition",
          active
            ? "bg-orange-50 text-orange-950 ring-1 ring-orange-300"
            : "text-slate-700 hover:bg-slate-50",
        ].join(" ")}
      >
        <span className={active ? "text-orange-700" : "text-slate-500 group-hover:text-slate-700"}>
          {getTypeIcon(type)}
        </span>
        {label}
      </button>
    );
  };

  return (
    <aside className="flex w-[260px] shrink-0 flex-col gap-6 border-r border-gray-200 bg-white px-3 py-4 min-[1600px]:w-[280px]">
      <section>
        <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Typ etykiety
        </h2>
        <div className="space-y-0.5">
          {LABEL_PRINT_MODULE_TYPE_ORDER.map((type) =>
            typeBtn(type, LABEL_PRINT_MODULE_TYPE_LABELS[type] || type),
          )}
          <div className="my-2 border-t border-gray-100" />
          {DOCUMENT_PRINT_MODULE_TYPE_ORDER.map((type) =>
            typeBtn(type, DOCUMENT_PRINT_MODULE_TYPE_LABELS[type] || type),
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Grupy
        </h2>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto [scrollbar-width:thin]">
          <button
            type="button"
            onClick={() => onSelectGroup(UNGROUPED_ID)}
            className={[
              "w-full rounded-xl px-3 py-2 text-left text-sm transition",
              selectedGroupId === UNGROUPED_ID
                ? "bg-slate-100 font-semibold text-slate-900"
                : "text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            Bez grupy
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelectGroup(g.id)}
              className={[
                "w-full truncate rounded-xl px-3 py-2 text-left text-sm transition",
                selectedGroupId === g.id
                  ? "bg-slate-100 font-semibold text-slate-900"
                  : "text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              {g.name}
            </button>
          ))}
        </div>
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => onNewGroupNameChange(e.target.value)}
              placeholder="Nazwa grupy"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300/40"
              onKeyDown={(e) => e.key === "Enter" && onCreateGroup()}
            />
            <button
              type="button"
              onClick={onCreateGroup}
              disabled={!newGroupName.trim() || creatingGroup}
              className="rounded-xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50"
              aria-label="Dodaj grupę"
            >
              +
            </button>
          </div>
          <p className="mt-1.5 px-0.5 text-[11px] text-slate-400">Dodaj nową grupę</p>
        </div>
      </section>
    </aside>
  );
}
