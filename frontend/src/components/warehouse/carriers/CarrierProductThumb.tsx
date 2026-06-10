import { ImageIcon } from "lucide-react";

type Props = {
  imageUrl?: string | null;
  alt?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASS = {
  sm: "h-10 w-10",
  md: "h-12 w-12",
  lg: "h-14 w-14",
} as const;

/** Zdjęcie produktu bez boxa — czyste, floating (OMS/WMS). */
export function CarrierProductThumb({ imageUrl, alt = "", size = "md", className = "" }: Props) {
  const src = (imageUrl || "").trim();
  const dim = SIZE_CLASS[size];

  if (!src) {
    return (
      <div
        className={`${dim} flex shrink-0 items-center justify-center text-slate-300 ${className}`}
        aria-hidden
      >
        <ImageIcon className={size === "sm" ? "h-5 w-5" : "h-6 w-6"} strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`${dim} shrink-0 object-contain ${className}`}
      loading="lazy"
    />
  );
}
