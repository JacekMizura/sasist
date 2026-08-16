type Props = {
  title: string;
  rootLabel: string;
  childLabels: string[];
  lead: string;
  body: string;
};

/** Compact structure + info — works inline (no page-wide sidebar rebuild). */
export function IntakeStructureInfoPanel({ title, rootLabel, childLabels, lead, body }: Props) {
  const children = childLabels.length > 0 ? childLabels : ["—"];
  return (
    <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <div className="mt-3 space-y-1.5 text-[12px] text-slate-700">
          <p className="font-medium text-slate-900">{rootLabel}</p>
          <p className="pl-2 text-slate-400" aria-hidden>
            ↓
          </p>
          <ul className="space-y-1 pl-2">
            {children.map((label, i) => (
              <li key={`${label}-${i}`} className="text-slate-700">
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5">
        <p className="text-[12px] font-semibold text-blue-950">{lead}</p>
        <p className="mt-1 text-[11px] leading-snug text-blue-900/80">{body}</p>
      </div>
    </aside>
  );
}
