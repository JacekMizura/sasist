import { Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { PrimaryButton } from "../../design-system/PrimaryButton";

/** Primary “create” control for list pages — Design System Primary (jak „Dodaj użytkownika”). */
export const listPageCreateActionClass = brandPrimaryButtonClass;

export function ListPageCreateLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className={listPageCreateActionClass}>
      <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
      <span className="whitespace-nowrap">{children}</span>
    </Link>
  );
}

export function ListPageCreateButton({
  onClick,
  children,
  disabled,
  type = "button",
}: {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <PrimaryButton type={type} onClick={onClick} disabled={disabled}>
      <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
      <span className="whitespace-nowrap">{children}</span>
    </PrimaryButton>
  );
}
