import { memo } from "react";
import { WmsSessionCounterPills } from "../../WmsSessionCounterPills";

export type StatusBadgesProps = {
  spakowane: number;
  doSpakowania: number;
  wTrakcie: number;
  braki?: number;
};

function StatusBadgesInner({ spakowane, doSpakowania, wTrakcie, braki = 0 }: StatusBadgesProps) {
  return (
    <WmsSessionCounterPills
      variant="packing"
      done={spakowane}
      todo={doSpakowania}
      progress={wTrakcie}
      shortage={braki}
    />
  );
}

function equal(a: StatusBadgesProps, b: StatusBadgesProps): boolean {
  return (
    a.spakowane === b.spakowane &&
    a.doSpakowania === b.doSpakowania &&
    a.wTrakcie === b.wTrakcie &&
    (a.braki ?? 0) === (b.braki ?? 0)
  );
}

export const StatusBadges = memo(StatusBadgesInner, equal);
