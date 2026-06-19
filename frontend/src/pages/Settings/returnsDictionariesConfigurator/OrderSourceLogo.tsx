import { useState } from "react";
import { Store } from "lucide-react";

import { resolveOrderSourceLogoPath } from "./marketplaceSourceUtils";

type Props = {
  code: string;
  label: string;
  className?: string;
};

const BOX = "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white";

export function OrderSourceLogo({ code, label, className }: Props) {
  const src = resolveOrderSourceLogoPath(code, label);
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <span className={`${BOX} text-slate-400 ${className ?? ""}`} aria-hidden>
        <Store className="h-4 w-4" strokeWidth={1.75} />
      </span>
    );
  }

  return (
    <span className={`${BOX} ${className ?? ""}`}>
      <img
        src={src}
        alt=""
        className="h-6 w-6 object-contain"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    </span>
  );
}
