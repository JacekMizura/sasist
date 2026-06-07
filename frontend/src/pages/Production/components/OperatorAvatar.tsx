type Props = {
  name?: string | null;
  size?: "sm" | "md";
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

const SIZE = { sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs" };

export function OperatorAvatar({ name, size = "md" }: Props) {
  const label = name?.trim() || "—";
  const unassigned = !name?.trim();
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-white",
        SIZE[size],
        unassigned ? "bg-slate-200 text-slate-500" : "bg-violet-600 text-white",
      ].join(" ")}
      title={unassigned ? "Nieprzypisany operator" : label}
    >
      {unassigned ? "?" : initials(label)}
    </span>
  );
}
