import type { HTMLAttributes, ReactNode } from "react";
import { colors, radius, typography } from "../tokens";
import { Card } from "./Card";

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, description, action, className = "", ...props }: EmptyStateProps) {
  return (
    <Card variant="dashed" className={className} {...props}>
      {title ? <p className={typography.h2}>{title}</p> : null}
      {description ? <p className={`mt-2 ${typography.body} ${colors.text.muted}`}>{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </Card>
  );
}

export type LoadingStateProps = HTMLAttributes<HTMLDivElement> & {
  label?: string;
};

export function LoadingState({ label = "Ładowanie…", className = "", ...props }: LoadingStateProps) {
  return (
    <div
      className={`flex items-center justify-center gap-2 py-10 text-sm ${colors.text.muted}${className ? ` ${className}` : ""}`.trim()}
      role="status"
      aria-live="polite"
      {...props}
    >
      <span
        className={`inline-block h-4 w-4 animate-spin ${radius.full} border-2 border-slate-300 border-t-orange-500`}
        aria-hidden
      />
      {label}
    </div>
  );
}

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  width?: string;
  height?: string;
};

export function Skeleton({ className = "", width, height, style, ...props }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse ${radius.md} bg-slate-200/80${className ? ` ${className}` : ""}`.trim()}
      style={{ width, height, ...style }}
      aria-hidden
      {...props}
    />
  );
}
