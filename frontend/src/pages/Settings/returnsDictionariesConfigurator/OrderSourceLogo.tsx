import { useMemo, useState } from "react";
import { Store } from "lucide-react";

import { orderSourceInitialLetter, resolveOrderSourceLogoUrl } from "./orderSourceUtils";

type Props = {
  label: string;
  logoUrl?: string | null;
  /** Podgląd lokalny (Object URL) przed zapisem. */
  previewUrl?: string | null;
  className?: string;
};

const BOX =
  "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200/80 bg-white text-sm font-semibold text-slate-600";

export function OrderSourceLogo({ label, logoUrl, previewUrl, className }: Props) {
  const resolved = useMemo(() => resolveOrderSourceLogoUrl(logoUrl), [logoUrl]);
  const src = previewUrl || resolved;
  const [broken, setBroken] = useState(false);

  if (src && !broken) {
    return (
      <span className={`${BOX} ${className ?? ""}`}>
        <img
          src={src}
          alt=""
          className="h-full w-full object-contain p-1"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      </span>
    );
  }

  const initial = orderSourceInitialLetter(label);
  if (initial) {
    return (
      <span className={`${BOX} ${className ?? ""}`} aria-hidden>
        {initial}
      </span>
    );
  }

  return (
    <span className={`${BOX} text-slate-400 ${className ?? ""}`} aria-hidden>
      <Store className="h-4 w-4" strokeWidth={1.75} />
    </span>
  );
}
