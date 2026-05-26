import { memo } from "react";
import { WmsSessionCounterPills } from "../../WmsSessionCounterPills";

export type StatusBadgesProps = {
  spakowane: number;
  doSpakowania: number;
  wTrakcie: number;
};

function StatusBadgesInner({ spakowane, doSpakowania, wTrakcie }: StatusBadgesProps) {
  return <WmsSessionCounterPills variant="packing" done={spakowane} todo={doSpakowania} progress={wTrakcie} />;
}

function equal(a: StatusBadgesProps, b: StatusBadgesProps): boolean {
  return a.spakowane === b.spakowane && a.doSpakowania === b.doSpakowania && a.wTrakcie === b.wTrakcie;
}

export const StatusBadges = memo(StatusBadgesInner, equal);
