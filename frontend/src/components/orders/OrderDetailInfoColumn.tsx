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

/** Flat info column — compact context strip above products. */
export function OrderDetailInfoColumn({ title, titleAddon, actions, children, className }: Props) {
  return (
    <section className={className}>
      <div className="flex items-start justify-between gap-2">
        <h2 className={`${odInfoSectionTitleClass} mb-0.5 flex flex-wrap items-center gap-2`}>
          {title}
          {titleAddon}
        </h2>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
      <div className="mt-2.5 space-y-1 text-[13px] leading-snug text-slate-900">{children}</div>
    </section>
  );
}
