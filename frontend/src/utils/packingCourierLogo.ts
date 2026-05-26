/** Logo kuriera z pola ``shipping_method`` (dopasowanie fragmentem, PL/EN). */
export function packingCourierLogoSrc(shippingMethod: string | null | undefined): string | null {
  const s = (shippingMethod || "").toLowerCase();
  if (s.includes("inpost")) return "/assets/carriers/inpost.svg";
  if (s.includes("dhl")) return "/assets/carriers/dhl.svg";
  if (s.includes("temu")) return "/assets/carriers/temu.svg";
  if (s.includes("dpd")) return "/assets/carriers/dpd.svg";
  if (s.includes("poczt")) return null;
  return null;
}
