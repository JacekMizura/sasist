import type { ReactNode } from "react";

import { appLayoutClasses } from "../../../layout/appLayoutTokens";

export type AppSectionCardProps = {
  children: ReactNode;
  className?: string;
  padding?: boolean;
};

/** White section surface — border only, no shadow. */
export function AppSectionCard({ children, className, padding = true }: AppSectionCardProps) {
  return (
    <div
      className={[appLayoutClasses.sectionCard, padding ? "p-5" : "", className ?? ""].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}
