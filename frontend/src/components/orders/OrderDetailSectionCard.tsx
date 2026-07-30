import type { ReactNode } from "react";

import { odCardMicroTitleClass, odCardShellClass } from "./orderDetailUiTokens";

type Props = {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
  contentClassName?: string;
  elevated?: boolean;
};

/** Shared order-detail card (summary / aside / bottom sections). */
export function OrderDetailSectionCard({
  title,
  children,
  right,
  className,
  contentClassName,
  elevated = false,
}: Props) {
  return (
    <section
      className={`${elevated ? "rounded-xl border border-slate-200 bg-white p-6 shadow-sm" : odCardShellClass} flex h-full flex-col ${className ?? ""}`.trim()}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className={odCardMicroTitleClass}>{title}</h3>
        {right}
      </div>
      <div className={`flex-1 ${contentClassName ?? ""}`}>{children}</div>
    </section>
  );
}
