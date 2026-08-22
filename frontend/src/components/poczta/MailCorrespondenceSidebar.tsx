import type { MailSidebarCounts } from "../../modules/poczta/services/mailApi";
import {
  MAIL_SIDEBAR_SECTIONS,
  type MailCorrespondenceBucket,
} from "../../modules/poczta/mailLabels";
import { PanelStatusSidebarHeader } from "../../components/panel/PanelStatusSidebarHeader";
import { PanelTreeCount } from "../../components/panel/PanelTreeCount";
import {
  panelTreeMetaRowClass,
  panelTreeStatusRowClass,
} from "../../components/panel/panelStatusTreeStyles";

type Props = {
  counts: MailSidebarCounts | null;
  activeBucket: MailCorrespondenceBucket | null;
  onBucketChange: (bucket: MailCorrespondenceBucket | null) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

export function MailCorrespondenceSidebar({
  counts,
  activeBucket,
  onBucketChange,
  collapsed = false,
  onToggleCollapsed,
}: Props) {
  const countFor = (bucket: MailCorrespondenceBucket): number => {
    if (!counts) return 0;
    return counts[bucket] ?? 0;
  };

  if (collapsed) {
    return (
      <div className="space-y-1">
        <PanelStatusSidebarHeader title="Korespondencja" collapsed onToggleCollapsed={onToggleCollapsed} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PanelStatusSidebarHeader title="Korespondencja" onToggleCollapsed={onToggleCollapsed} />
      {MAIL_SIDEBAR_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className={panelTreeMetaRowClass(false)}>{section.title}</p>
          <ul className="mt-1 space-y-0.5">
            {section.items.map((item) => {
              const active = activeBucket === item.bucket;
              return (
                <li key={item.bucket}>
                  <button
                    type="button"
                    className={`${panelTreeStatusRowClass} w-full text-left ${active ? "bg-slate-200/80 font-semibold" : ""}`}
                    onClick={() => onBucketChange(active ? null : item.bucket)}
                  >
                    <span className="truncate">{item.label}</span>
                    <PanelTreeCount value={countFor(item.bucket)} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
