import { useEffect, useState } from "react";

import type { ComplaintShipmentCarrier } from "../../types/complaintShipment";

export const CARRIER_OPTIONS: { value: ComplaintShipmentCarrier; label: string }[] = [
  { value: "INPOST", label: "InPost" },
  { value: "DPD", label: "DPD" },
  { value: "DHL", label: "DHL" },
];

const CARRIER_LOGO_SRC: Partial<Record<ComplaintShipmentCarrier, string>> = {
  INPOST: "/assets/carriers/inpost.svg",
  DPD: "/assets/carriers/dpd.svg",
  DHL: "/assets/carriers/dhl.svg",
};

export function carrierLabel(code: string): string {
  return CARRIER_OPTIONS.find((c) => c.value === code)?.label ?? code;
}

export function CarrierWithLogo({ code, label }: { code: string; label: string }) {
  const key = code.toUpperCase().trim() as ComplaintShipmentCarrier;
  const src = CARRIER_LOGO_SRC[key] ?? null;
  const [showLogo, setShowLogo] = useState(Boolean(src));

  useEffect(() => {
    setShowLogo(Boolean(src));
  }, [code, src]);

  if (!src || !showLogo) {
    return <span>{label}</span>;
  }

  return (
    <span className="inline-flex items-center gap-2">
      <img
        src={src}
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 shrink-0 object-contain"
        loading="lazy"
        onError={() => setShowLogo(false)}
      />
      <span>{label}</span>
    </span>
  );
}
