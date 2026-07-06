import type { EditorRightTab } from "../hooks/useEditorLayoutState";
import { InspectorPanelBody, type InspectorPanelBodyProps } from "./InspectorPanelBody";

const PRIMARY_TABS: { id: EditorRightTab; label: string; short: string }[] = [
  { id: "html", label: "HTML", short: "H" },
  { id: "pdf", label: "PDF", short: "P" },
  { id: "errors", label: "Walidacja", short: "!" },
  { id: "usage", label: "Użycia", short: "U" },
];

const SECONDARY_TABS: { id: EditorRightTab; label: string; short: string }[] = [
  { id: "compare", label: "Porównaj", short: "≠" },
  { id: "impact", label: "Wpływ", short: "Δ" },
  { id: "dependencies", label: "Zależności", short: "◎" },
  { id: "history", label: "Historia", short: "⌚" },
];

type Props = Omit<InspectorPanelBodyProps, "activeTab"> & {
  activeTab: EditorRightTab;
  onTabChange: (tab: EditorRightTab) => void;
  collapsed: boolean;
  detached: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onDetach: () => void;
};

export function EditorRightPanel({
  collapsed,
  detached,
  onExpand,
  onCollapse,
  onDetach,
  activeTab,
  onTabChange,
  liveValidation,
  validation,
  ...bodyProps
}: Props) {
  const issueCount = (liveValidation?.issues.length ?? 0) || (validation && !validation.ok ? validation.issues.length : 0);
  const isSecondary = SECONDARY_TABS.some((t) => t.id === activeTab);

  const rail = (
    <aside className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-l border-slate-200 bg-white py-2 transition-[width] duration-200 ease-in-out">
      {[...PRIMARY_TABS, ...SECONDARY_TABS].map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          className={`relative flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold ${
            activeTab === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
          onClick={() => {
            onTabChange(t.id);
            if (detached) onExpand();
            else onExpand();
          }}
        >
          {t.short}
          {t.id === "errors" && issueCount ? (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500" />
          ) : null}
        </button>
      ))}
    </aside>
  );

  if (detached || collapsed) return rail;

  return (
    <aside className="flex h-full w-[340px] max-w-[340px] shrink-0 flex-col border-l border-slate-200 bg-white transition-[width] duration-200 ease-in-out">
      <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-2">
        {PRIMARY_TABS.map((t) => (
          <TabButton
            key={t.id}
            label={t.label}
            active={activeTab === t.id}
            badge={t.id === "errors" ? issueCount : 0}
            onClick={() => onTabChange(t.id)}
          />
        ))}
        {isSecondary ? (
          <TabButton label={SECONDARY_TABS.find((t) => t.id === activeTab)?.label ?? "Więcej"} active onClick={() => {}} />
        ) : null}
        <span className="ml-1 rounded p-1 text-[11px] text-slate-400" title="Panel przypięty">
          📌
        </span>
        <button
          type="button"
          className="rounded p-1 text-[11px] text-slate-500 hover:bg-slate-100"
          title="Otwórz jako panel pływający (drugi monitor)"
          onClick={onDetach}
        >
          ↗
        </button>
        <button
          type="button"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Zwiń inspektor"
          onClick={onCollapse}
        >
          »
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
        <InspectorPanelBody activeTab={activeTab} validation={validation} liveValidation={liveValidation} {...bodyProps} />
      </div>
    </aside>
  );
}

function TabButton({
  label,
  active,
  badge,
  onClick,
}: {
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[11px] font-medium ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
      {badge ? <span className="ml-1 rounded-full bg-rose-500 px-1 text-[9px] text-white">{badge}</span> : null}
    </button>
  );
}
