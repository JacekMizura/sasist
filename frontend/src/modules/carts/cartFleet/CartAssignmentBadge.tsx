import { HoverPopover } from "../../../components/ui/HoverPopover";

export type CartAssignmentType = "collecting" | "packing" | null;

export type CartAssignmentProps = {
  assigned_user_id?: number | null;
  assigned_user_name?: string | null;
  assignment_type?: CartAssignmentType;
  assignment_since?: string | null;
};

function formatAssignmentSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const badgeBase =
  "inline-flex max-w-[14rem] shrink-0 items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-tight";

/**
 * Live cart ownership badge (packing > collecting > unassigned).
 * Tooltip: assignee, mode, since — or unassigned message.
 */
export function CartAssignmentBadge({
  assigned_user_name,
  assignment_type,
  assignment_since,
}: CartAssignmentProps) {
  const type = assignment_type ?? null;
  const name = (assigned_user_name || "").trim();
  const since = formatAssignmentSince(assignment_since);

  let label: string;
  let badgeClass: string;
  let tooltip: string;

  if (type === "packing" && name) {
    label = `📦 ${name} • Pakowanie`;
    badgeClass = `${badgeBase} bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200`;
    tooltip = [`Przypisany do:`, name, ``, `Tryb:`, `Pakowanie`, ...(since ? [``, `Od:`, since] : [])].join("\n");
  } else if (type === "collecting" && name) {
    label = `👤 ${name} • Zbieranie`;
    badgeClass = `${badgeBase} bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200`;
    tooltip = [`Przypisany do:`, name, ``, `Tryb:`, `Zbieranie`, ...(since ? [``, `Od:`, since] : [])].join("\n");
  } else {
    label = "Nieprzypisany";
    badgeClass = `${badgeBase} bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200`;
    tooltip = "Wózek nie jest obecnie przypisany.";
  }

  return (
    <HoverPopover content={tooltip}>
      <span className={badgeClass} title={undefined}>
        {label}
      </span>
    </HoverPopover>
  );
}
