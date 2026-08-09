import { memo, useEffect, useRef, useState } from "react";
import { Package, Truck } from "lucide-react";
import { pickShippingMethodLogoSrc } from "../../utils/shippingMethodLogoUrl";

export type ShippingMethodLogoSize =
  | "lg"
  | "md"
  | "sm"
  | "xs"
  | "listRow"
  | "orderList"
  /** WMS pakowanie — lewy panel (~64–80px) */
  | "packingSidebar"
  /** WMS pakowanie — kafel po pakowaniu (~56–72px) */
  | "packingTile"
  /** Ekran potwierdzenia po pakowaniu — duży logo operatora */
  | "postPackHero";

const IMG: Record<ShippingMethodLogoSize, string> = {
  lg: "max-h-[48px] w-auto max-w-[200px] object-contain object-left",
  md: "max-h-10 w-auto max-w-[180px] object-contain object-left",
  sm: "max-h-6 w-auto max-w-[140px] object-contain object-left",
  xs: "max-h-5 w-auto max-w-[120px] object-contain object-left",
  /** Settings list row: max 40px height, centered in 64×64 cell */
  listRow: "max-h-10 w-auto max-w-[64px] object-contain object-center",
  /** Orders list: ~56px logo cell, fast scan */
  orderList: "max-h-14 w-auto max-w-[120px] object-contain object-center",
  packingSidebar: "h-auto w-full max-h-[80px] max-w-[80px] min-w-[64px] object-contain object-left",
  packingTile: "h-auto w-full max-h-[64px] max-w-[72px] min-w-[56px] object-contain object-left",
  postPackHero:
    "h-auto max-h-[112px] w-auto max-w-[min(240px,28vw)] min-w-[72px] object-contain object-right",
};

const ICON: Record<ShippingMethodLogoSize, string> = {
  lg: "h-10 w-10",
  md: "h-9 w-9",
  sm: "h-6 w-6",
  xs: "h-4 w-4",
  listRow: "h-10 w-10",
  orderList: "h-10 w-10",
  packingSidebar: "h-20 w-20",
  packingTile: "h-[4.5rem] w-[4.5rem]",
  postPackHero: "h-24 w-24",
};

export type ShippingMethodLogoProps = {
  logoUrl?: string | null;
  methodName?: string | null;
  size?: ShippingMethodLogoSize;
  className?: string;
  /** When no carrier image/heuristic: truck (default) or generic package. */
  placeholder?: "truck" | "package";
  /** Stable identity for DEV diagnostics (method id). */
  debugMethodId?: string | null;
};

function ShippingMethodLogoInner({
  logoUrl,
  methodName,
  size = "md",
  className,
  placeholder = "truck",
  debugMethodId,
}: ShippingMethodLogoProps) {
  const [customFailed, setCustomFailed] = useState(false);
  const [heuristicFailed, setHeuristicFailed] = useState(false);
  const [seenLogoUrl, setSeenLogoUrl] = useState(() => (logoUrl ?? "").trim());
  const mountedRef = useRef(true);
  const lastSrcRef = useRef<string | null>(null);

  const logoKey = (logoUrl ?? "").trim();
  // Reset local failure only when the stored logo path actually changes (no useEffect remount churn).
  if (logoKey !== seenLogoUrl) {
    setSeenLogoUrl(logoKey);
    setCustomFailed(false);
    setHeuristicFailed(false);
  }

  const pick = pickShippingMethodLogoSrc(logoUrl, methodName, {
    customFailed,
    heuristicFailed,
  });
  const wrap = ["inline-flex shrink-0 items-center justify-center self-center text-slate-400", className]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    mountedRef.current = true;
    if (import.meta.env.DEV) {
      // Temporary lifecycle diagnostics — remove once NS_BINDING_ABORTED is confirmed fixed in prod.
      console.debug("[ShippingMethodLogo] mount", {
        methodId: debugMethodId ?? null,
        logoUrl: logoKey || null,
        src: pick.src,
        source: pick.source,
      });
    }
    return () => {
      mountedRef.current = false;
      if (import.meta.env.DEV) {
        console.debug("[ShippingMethodLogo] unmount", {
          methodId: debugMethodId ?? null,
          logoUrl: logoKey || null,
          lastSrc: lastSrcRef.current,
        });
      }
    };
    // Intentionally once per component instance (mount/unmount), not on every src change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (lastSrcRef.current === pick.src) return;
    console.debug("[ShippingMethodLogo] src change", {
      methodId: debugMethodId ?? null,
      from: lastSrcRef.current,
      to: pick.src,
      source: pick.source,
    });
    lastSrcRef.current = pick.src;
  }, [pick.src, pick.source, debugMethodId]);

  if (pick.src) {
    return (
      <span className={wrap}>
        <img
          src={pick.src}
          alt=""
          className={IMG[size]}
          // Eager: avoids lazy+viewport races. Remount (not lazy) was aborting GETs.
          loading="eager"
          decoding="async"
          onError={() => {
            // Abort from unmount/StrictMode remount fires onError in Firefox — must not flip src.
            if (!mountedRef.current) return;
            if (pick.source === "custom") {
              setCustomFailed(true);
              return;
            }
            if (pick.source === "heuristic") {
              setHeuristicFailed(true);
            }
          }}
        />
      </span>
    );
  }

  const Icon = placeholder === "package" ? Package : Truck;
  return (
    <span className={wrap} aria-hidden>
      <Icon className={ICON[size]} strokeWidth={1.5} />
    </span>
  );
}

/** Carrier logo — memoized so parent list rerenders do not remount <img>. */
export const ShippingMethodLogo = memo(ShippingMethodLogoInner);
