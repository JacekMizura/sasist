import { useState } from "react";
import { ImageIcon } from "lucide-react";

const SIZE_CLASS = {
  default: "h-16 w-16",
  sm: "h-10 w-10",
} as const;

export type ProductThumbProps = {
  url: string | null;
  size?: keyof typeof SIZE_CLASS;
};

/** Miniatury produktu bez tła i ramek (OMS / panel list). */
export function ProductThumb({ url, size = "default" }: ProductThumbProps) {
  const [broken, setBroken] = useState(false);
  const dim = SIZE_CLASS[size];

  if (!url || broken) {
    return (
      <div className={`${dim} flex shrink-0 items-center justify-center text-slate-300`} aria-hidden>
        <ImageIcon className={size === "sm" ? "h-4 w-4" : "h-6 w-6"} strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={`${dim} shrink-0 object-contain`}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
