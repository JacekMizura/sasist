/** Compact business labels of active STATUS_ACTION effects on a status list row. */
export type StatusActionOverviewItem = { key: string; label: string };

type Props = {
  actions: StatusActionOverviewItem[] | undefined;
};

export function StatusActionListHints({ actions }: Props) {
  if (!actions || actions.length === 0) {
    return <p className="mt-0.5 text-[11px] text-slate-400">Brak automatycznych akcji</p>;
  }
  return (
    <ul className="mt-0.5 space-y-0">
      {actions.map((a) => (
        <li key={a.key} className="flex items-baseline gap-1 text-[11px] leading-snug text-slate-600">
          <span className="select-none text-emerald-600" aria-hidden>
            ✓
          </span>
          <span>{a.label}</span>
        </li>
      ))}
    </ul>
  );
}
