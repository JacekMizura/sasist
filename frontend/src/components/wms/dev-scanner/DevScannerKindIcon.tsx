import {
  ClipboardList,
  Container,
  MapPin,
  Package,
  ShoppingBasket,
  ShoppingCart,
  Tag,
} from "lucide-react";
import type { DevScannerObjectKind } from "./types";

export function DevScannerKindIcon({
  kind,
  className = "text-slate-500",
  size = 18,
}: {
  kind: DevScannerObjectKind;
  className?: string;
  size?: number;
}) {
  const props = { size, strokeWidth: 2.25 as const, className };
  switch (kind) {
    case "cart":
      return <ShoppingCart {...props} className={className || "text-indigo-600"} />;
    case "basket":
      return <ShoppingBasket {...props} className={className || "text-violet-600"} />;
    case "product":
      return <Package {...props} className={className || "text-sky-600"} />;
    case "location":
      return <MapPin {...props} className={className || "text-emerald-600"} />;
    case "carrier":
      return <Container {...props} className={className || "text-amber-700"} />;
    case "order":
      return <ClipboardList {...props} className={className || "text-rose-600"} />;
    default:
      return <Tag {...props} className={className || "text-slate-500"} />;
  }
}
