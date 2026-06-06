import { MapPin } from "lucide-react";
import { safeDisplay } from "../../../utils/safeStrings";
import { resolveLocationZoneKind, ZONE_BADGE_CLASS } from "./stockZoneStyles";

type Props = {
  code: string | null | undefined;
  zoneType?: string | null;
};

export function LocationBadge({ code, zoneType }: Props) {
  const kind = resolveLocationZoneKind(zoneType);
  
  return (
    <span 
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold tracking-wide uppercase shadow-sm transition-colors ${ZONE_BADGE_CLASS[kind]}`}
    >
      <MapPin size={12} className="opacity-70" />
      {safeDisplay(code, "brak lok.")}
    </span>
  );
}