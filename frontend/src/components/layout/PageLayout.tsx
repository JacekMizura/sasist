/**
 * Default export = unified page shell ({@link ./PageContainer}).
 * Secondary panels: {@link PageSurfaceCard} only when **not** already inside the default shell.
 */

import type { ReactNode } from "react";

import PageCardBase from "../ui/PageCard";

export type { PageContainerProps } from "./PageContainer";
export {
  PageContainer,
  PageContainer as default,
  PageGutter,
  pageContainerWidthAlignClass,
} from "./PageContainer";

export { default as PageCard } from "../ui/PageCard";

/** Extra white panel — avoid nesting inside {@link PageContainer} (double card). */
export function PageSurfaceCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <PageCardBase className={`space-y-4 ${className}`.trim()}>{children}</PageCardBase>;
}

/** Re-export — prefer `import { PageHeader } from "./PageHeader"`. */
export { PageHeader } from "./PageHeader";
export { SettingsModuleStack } from "./SettingsModuleStack";
