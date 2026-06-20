import { PanelStatusWmsIconColumn } from "../panel/PanelStatusWmsIconColumn";
import { PanelSubgroupLineHeader } from "../panel/PanelSubgroupLineHeader";
import { PanelTreeCount } from "../panel/PanelTreeCount";
import { PanelTreeGroupRow } from "../panel/PanelTreeGroupRow";
import {
  PANEL_TREE_CHILDREN_CLASS,
  PANEL_TREE_GROUP_SECTION_CLASS,
  PANEL_TREE_GROUP_STATUS_LIST_CLASS,
  PANEL_TREE_SUBGROUP_CHILDREN_CLASS,
  panelTreeStatusBarClass,
} from "../panel/panelStatusTreeStyles";
import { ModuleListStatusPill } from "../listPage/moduleList/ModuleListTableParts";
import type { PanelConfigurableUiStatusBrief } from "../../utils/panelListStatusBriefMappers";
import type { PanelSidebarMainGroup } from "../../utils/panelSidebarHierarchy";
import { panelTreeStatusRowPresentation } from "../../utils/panelTreeStatusRowPresentation";
import type { OrderUiMainGroup } from "../../types/orderUiStatus";

export type PanelStatusConfiguratorPreviewProps = {
  name: string;
  count?: number;
  mainGroup: PanelSidebarMainGroup;
  mainGroupLabel: string;
  subgroupLabel?: string | null;
  badgeHex: string;
  backgroundHex?: string;
  textHex?: string;
  imageUrl?: string | null;
  /** Symulacja aktywnego filtra w sidebarze. */
  active?: boolean;
  counterColorHex?: string | null;
  className?: string;
};

function toListBrief(props: PanelStatusConfiguratorPreviewProps): PanelConfigurableUiStatusBrief {
  return {
    name: props.name.trim() || "—",
    color: props.badgeHex,
    main_group: props.mainGroup,
    badge_color: props.badgeHex,
    background_color: props.backgroundHex ?? props.badgeHex,
    text_color: props.textHex ?? "#0f172a",
    image_url: props.imageUrl ?? null,
  };
}

export function PanelStatusConfiguratorPreview({
  name,
  count = 4,
  mainGroup,
  mainGroupLabel,
  subgroupLabel,
  badgeHex,
  backgroundHex,
  textHex,
  imageUrl,
  active = true,
  counterColorHex,
  className,
}: PanelStatusConfiguratorPreviewProps) {
  const displayName = name.trim() || "Nazwa statusu";
  const groupCount = count;
  const listBrief = toListBrief({
    name,
    count,
    mainGroup,
    mainGroupLabel,
    subgroupLabel,
    badgeHex,
    backgroundHex,
    textHex,
    imageUrl,
    active,
    counterColorHex,
  });

  const row = panelTreeStatusRowPresentation(
    {
      color: badgeHex,
      badge_color: badgeHex,
      background_color: backgroundHex ?? null,
      text_color: textHex ?? null,
    },
    mainGroup,
    active,
  );

  const statusRow = (
    <div className={row.rowClassName} style={row.rowStyle} aria-hidden>
      <PanelStatusWmsIconColumn markers={[]} />
      <span className={panelTreeStatusBarClass(active)} style={{ backgroundColor: row.stripeHex }} aria-hidden />
      <span className="min-w-0 flex-1 leading-snug" style={row.labelStyle}>
        {displayName}
      </span>
      {imageUrl ? <img src={imageUrl} alt="" className="mt-0.5 h-4 w-4 shrink-0 rounded object-contain" /> : null}
      <PanelTreeCount value={count} active={active} colorHex={counterColorHex} />
    </div>
  );

  return (
    <div className={`space-y-5 ${className ?? ""}`}>
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Podgląd w panelu</p>
        <div className="rounded-lg border border-slate-200/90 bg-white p-3">
          <section className={`${PANEL_TREE_GROUP_SECTION_CLASS} first:pt-0`}>
            <PanelTreeGroupRow
              label={mainGroupLabel}
              count={groupCount}
              mainGroup={mainGroup as OrderUiMainGroup}
              expanded
              active={false}
              onFilter={() => undefined}
              onToggle={() => undefined}
            />
            <div className={PANEL_TREE_CHILDREN_CLASS}>
              {(subgroupLabel ?? "").trim() ? (
                <>
                  <PanelSubgroupLineHeader
                    title={(subgroupLabel ?? "").trim()}
                    totalCount={groupCount}
                    expanded
                    onToggle={() => undefined}
                    showCount={false}
                  />
                  <div className={PANEL_TREE_SUBGROUP_CHILDREN_CLASS}>{statusRow}</div>
                </>
              ) : (
                <div className={PANEL_TREE_GROUP_STATUS_LIST_CLASS}>{statusRow}</div>
              )}
            </div>
          </section>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Podgląd na liście</p>
        <div className="rounded-lg border border-slate-200/90 bg-white px-3 py-3">
          <ModuleListStatusPill status={listBrief} terminal={mainGroup === "DONE"} terminalPositive={mainGroup === "DONE"} />
        </div>
      </div>
    </div>
  );
}
