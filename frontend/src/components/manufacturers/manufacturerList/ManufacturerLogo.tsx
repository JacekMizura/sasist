import { useState } from "react";
import { ImageOff } from "lucide-react";

import { manufacturersListLogoBoxClass } from "./manufacturersListTableTokens";

function firstLogoUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const t = url.trim();
  if (!t) return null;
  const first = t
    .split(";")
    .map((s) => s.trim())
    .find(Boolean);
  return first || null;
}

export function ManufacturerLogo({ logoUrl }: { logoUrl?: string | null }) {
  const [broken, setBroken] = useState(false);
  const src = firstLogoUrl(logoUrl ?? undefined);

  return (
    <div className={manufacturersListLogoBoxClass} aria-hidden={!src || broken}>
      {!src || broken ? (
        <ImageOff className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.5} aria-hidden />
      ) : (
        <img
          src={src}
          alt=""
          className="max-h-10 max-w-10 object-contain"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}
