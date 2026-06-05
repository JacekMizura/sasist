import type { ReactNode } from "react";
import { WMS_OPERATIONAL_CONTAINER } from "./wmsLayoutTokens";

type ShellProps = {
  children: ReactNode;
  className?: string;
};

/** Page column in normal document flow — no sticky, no overlay. */
export function WmsOperationalPageShell({ children, className = "" }: ShellProps) {
  return <div className={`flex min-h-full w-full flex-col ${className}`}>{children}</div>;
}

export function WmsOperationalPageHeader({ children, className = "" }: ShellProps) {
  return (
    <div className={`shrink-0 border-b border-slate-200 bg-white ${className}`}>
      <div className={WMS_OPERATIONAL_CONTAINER}>{children}</div>
    </div>
  );
}

export function WmsOperationalPageBody({ children, className = "" }: ShellProps) {
  return (
    <div className={`flex-1 py-4 md:py-6 ${className}`}>
      <div className={WMS_OPERATIONAL_CONTAINER}>{children}</div>
    </div>
  );
}

export function WmsOperationalPageFooter({ children, className = "" }: ShellProps) {
  return (
    <div className={`shrink-0 border-t border-slate-200 bg-white ${className}`}>
      <div className={`${WMS_OPERATIONAL_CONTAINER} py-4 md:py-5`}>{children}</div>
    </div>
  );
}
