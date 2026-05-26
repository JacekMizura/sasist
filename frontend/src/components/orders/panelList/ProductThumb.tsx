import { useState } from "react";

const BOX = "h-16 w-16 min-h-[56px] min-w-[56px] shrink-0 rounded-lg";
const BOX_SM = "h-10 w-10 min-h-10 min-w-10 shrink-0 rounded";

export type ProductThumbProps = {
  url: string | null;
  size?: "default" | "sm";
};

export function ProductThumb({ url, size = "default" }: ProductThumbProps) {
  const [broken, setBroken] = useState(false);
  const boxClass = size === "sm" ? BOX_SM : BOX;
  if (!url || broken) {
    return (
      <div className={`${boxClass} flex items-center justify-center border border-slate-200/90 bg-slate-50`} aria-hidden>
        <svg className={`${size === "sm" ? "h-4 w-4" : "h-7 w-7"} text-slate-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
        </svg>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className={`${boxClass} border border-slate-200/90 bg-white object-contain`}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
