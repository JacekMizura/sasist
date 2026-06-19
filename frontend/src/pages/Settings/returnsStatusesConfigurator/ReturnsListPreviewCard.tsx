import { Check } from "lucide-react";

import type { ReturnModuleConfigDto } from "../../../types/returnModuleConfig";
import type { ReturnUiStatusPanelSummary } from "../../../types/wmsReturn";
import { panelSidebarSubCountBadgeClass, panelSidebarSubRowStyleRich } from "../../../utils/panelSidebarHierarchy";
import { partitionStatusesBySubgroupForSettings } from "../../../utils/panelUiStatusSettingsTree";
import { PRODUCT_DECISION_DOT, RETURN_MAIN_GROUP_LABELS, RETURN_MAIN_GROUP_ORDER } from "./constants";

type Props = {
  summary: ReturnUiStatusPanelSummary | null;
  cfg: ReturnModuleConfigDto;
};

export function ReturnsListPreviewCard({ summary, cfg }: Props) {
  const decisions = [...cfg.product_decisions]
    .filter((d) => d.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Podgląd na liście zwrotów</h3>
        <p className="mt-1 text-xs text-slate-500">Symulacja panelu bocznego i decyzji produktowych.</p>
      </header>
      <div className="space-y-5 px-4 py-4">
        {RETURN_MAIN_GROUP_ORDER.map((mg) => {
          const block = summary?.groups.find((g) => g.main_group === mg);
          const statuses = (block?.sub_statuses ?? []).filter((s) => s.is_active !== false);
          const { ungrouped, subgroupBuckets } = partitionStatusesBySubgroupForSettings(statuses);

          return (
            <div key={mg}>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{RETURN_MAIN_GROUP_LABELS[mg]}</p>
              <div className="space-y-1.5">
                {subgroupBuckets.map((bucket) =>
                  bucket.rows.map((r) => (
                    <PreviewStatusRow key={r.id} mainGroup={mg} name={r.name} count={r.count} status={r} />
                  )),
                )}
                {ungrouped.map((r) => (
                  <PreviewStatusRow key={r.id} mainGroup={mg} name={r.name} count={r.count} status={r} />
                ))}
                {statuses.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Brak statusów w tej grupie</p>
                ) : null}
              </div>
            </div>
          );
        })}

        <div className="border-t border-slate-100 pt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Decyzje produktowe</p>
          <ul className="space-y-1.5">
            {decisions.map((d, i) => (
              <li key={d.code} className="flex items-center gap-2 text-sm text-slate-800">
                <span className={`h-2 w-2 shrink-0 rounded-full ${PRODUCT_DECISION_DOT[i % PRODUCT_DECISION_DOT.length]}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{d.label}</span>
                <Check className="h-4 w-4 shrink-0 text-emerald-500" strokeWidth={2.5} aria-hidden />
              </li>
            ))}
            {decisions.length === 0 ? <li className="text-xs text-slate-400 italic">Brak aktywnych decyzji</li> : null}
          </ul>
        </div>
      </div>
    </section>
  );
}

function PreviewStatusRow({
  mainGroup,
  name,
  count,
  status,
}: {
  mainGroup: "NEW" | "IN_PROGRESS" | "DONE";
  name: string;
  count: number;
  status: { badge_color?: string | null; color?: string; background_color?: string | null; text_color?: string | null; image_url?: string | null };
}) {
  const rowStyle = panelSidebarSubRowStyleRich(status, mainGroup, false);
  return (
    <div
      className="flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-shadow"
      style={rowStyle}
    >
      {status.image_url ? <img src={status.image_url} alt="" className="h-5 w-5 shrink-0 rounded object-contain" /> : null}
      <span className="min-w-0 truncate">{name}</span>
      <span className={`ml-auto ${panelSidebarSubCountBadgeClass()}`}>{count}</span>
    </div>
  );
}
