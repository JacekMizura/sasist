import { safeDisplay } from "../../../utils/safeStrings";
import { resolveLocationZoneKind, ZONE_BADGE_CLASS } from "./stockZoneStyles";

type Props = {
  code: string | null | undefined;
  zoneType?: string | null;
};

export function LocationBadge({ code, zoneType }: Props) {
  const kind = resolveLocationZoneKind(zoneType);
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ZONE_BADGE_CLASS[kind]}`}>
      {safeDisplay(code, "brak lok.")}
    </span>
  );
}
