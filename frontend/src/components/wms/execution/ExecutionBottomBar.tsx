import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Extra bottom padding for main content when bar is visible */
  reserveSpace?: boolean;
};

/** Sticky bottom actions — thumb zone, one-hand friendly. */
export function ExecutionBottomBar({ children }: Props) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[45] border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">{children}</div>
    </div>
  );
}

export const EXECUTION_BOTTOM_RESERVE = "pb-36";
