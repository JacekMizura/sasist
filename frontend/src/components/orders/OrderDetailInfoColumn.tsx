import type { ReactNode } from "react";

import { odInfoSectionTitleClass } from "./orderDetailUiTokens";

type Props = {
  title: ReactNode;
  /** Optional badge / SMART / count next to title. */
  titleAddon?: ReactNode;
  /** Top-right actions (edit, collapse). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Flat info column matching order-card mockup (no uppercase micro-title card chrome). */
export function OrderDetailInfoColumn({ title, titleAddon, actions, children, className }: Props) {
  return (
    <section className={className}>
      <div className="flex items-start justify-between gap-2">
        <h2 className={`${odInfoSectionTitleClass} mb-1 flex flex-wrap items-center gap-2`}>
          {title}
          {titleAddon}
        </h2>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-3 space-y-2 text-sm text-slate-900">{children}</div>
    </section>
  );
}
