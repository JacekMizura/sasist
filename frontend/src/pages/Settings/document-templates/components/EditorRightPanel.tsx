import type { EditorRightTab } from "../hooks/useEditorLayoutState";
import { InspectorPanelBody, type InspectorPanelBodyProps } from "./InspectorPanelBody";

const PRIMARY_TABS: { id: EditorRightTab; label: string; icon: string }[] = [
  { id: "html", label: "HTML", icon: "🌐" },
  { id: "pdf", label: "PDF", icon: "📄" },
  { id: "errors", label: "Walidacja", icon: "✔" },
  { id: "usage", label: "Przypisania", icon: "📎" },
];

const SECONDARY_TABS: { id: EditorRightTab; label: string; icon: string }[] = [
  { id: "compare", label: "Porównaj", icon: "≠" },
  { id: "impact", label: "Wpływ", icon: "Δ" },
  { id: "dependencies", label: "Zależności", icon: "◎" },
  { id: "history", label: "Historia", icon: "⌚" },
];

type Props = Omit<InspectorPanelBodyProps, "activeTab"> & {
  activeTab: EditorRightTab;
  onTabChange: (tab: EditorRightTab) => void;
  collapsed: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  panelWidth: number;
  onResizeStart: (e: React.MouseEvent) => void;
  resizing: boolean;
};

export function EditorRightPanel({
  collapsed,
  onExpand,
  onCollapse,
  activeTab,
  onTabChange,
  panelWidth,
  onResizeStart,
  resizing,
  validation,
  ...bodyProps
}: Props) {
  const issueCount = validation && !validation.ok ? validation.issues.length : 0;
  const isSecondary = SECONDARY_TABS.some((t) => t.id === activeTab);

  if (collapsed) {
    return (
      <aside className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-l border-slate-200 bg-slate-50 py-2">
        {[...PRIMARY_TABS, ...SECONDARY_TABS].map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            className={`relative flex h-9 w-9 items-center justify-center rounded-md text-sm ${
              activeTab === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"
            }`}
            onClick={() => {
              onTabChange(t.id);
              onExpand();
            }}
          >
            {t.icon}
            {t.id === "errors" && issueCount ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500" />
            ) : null}
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l border-slate-200 bg-slate-50"
      style={{ width: panelWidth }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        className={`absolute bottom-0 left-0 top-0 z-10 w-1 cursor-col-resize hover:bg-blue-300/60 ${resizing ? "bg-blue-400/70" : ""}`}
        onMouseDown={onResizeStart}
      />
      <div className="flex items-center gap-0.5 border-b border-slate-200 bg-white px-2 py-2 pl-3">
        {PRIMARY_TABS.map((t) => (
          <TabButton
            key={t.id}
            icon={t.icon}
            label={t.label}
            active={activeTab === t.id}
            badge={t.id === "errors" ? issueCount : 0}
            onClick={() => onTabChange(t.id)}
          />
        ))}
        {isSecondary ? (
          <TabButton
            icon={SECONDARY_TABS.find((t) => t.id === activeTab)?.icon ?? "…"}
            label={SECONDARY_TABS.find((t) => t.id === activeTab)?.label ?? "Więcej"}
            active
            onClick={() => {}}
          />
        ) : null}
        <button
          type="button"
          className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100"
          title="Zwiń podgląd"
          onClick={onCollapse}
        >
          »
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1 py-2 text-sm">
        <InspectorPanelBody activeTab={activeTab} validation={validation} {...bodyProps} />
      </div>
    </aside>
  );
}

function TabButton({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      <span aria-hidden>{icon}</span>
      <span className="hidden xl:inline">{label}</span>
      {badge ? <span className="rounded-full bg-rose-500 px-1 text-[9px] text-white">{badge}</span> : null}
    </button>
  );
}
