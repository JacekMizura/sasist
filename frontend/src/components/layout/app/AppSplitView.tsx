import type { ReactNode } from "react";

import { appLayoutClasses } from "../../../layout/appLayoutTokens";

export type AppSplitViewProps = {
  /** Left rail (catalog, nav). */
  left?: ReactNode;
  /** Main workspace (canvas, table). */
  children: ReactNode;
  /** Right detail panel — use {@link AppRightPanel}. */
  right?: ReactNode;
  className?: string;
};

/**
 * Horizontal split: optional left rail + flex main + optional right panel (all in-flow).
 */
export function AppSplitView({ left, children, right, className }: AppSplitViewProps) {
  return (
    <div className={[appLayoutClasses.splitRow, className ?? ""].filter(Boolean).join(" ")}>
      {left ? <div className="flex h-full min-h-0 shrink-0 flex-col self-stretch">{left}</div> : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      {right ? <div className="flex h-full min-h-0 shrink-0 flex-col self-stretch">{right}</div> : null}
    </div>
  );
}
