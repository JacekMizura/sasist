import { ImageIcon, Package } from "lucide-react";

type Props = {
  imageUrl?: string | null;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASS = {
  sm: "h-10 w-10",
  md: "h-14 w-14",
  lg: "h-20 w-20",
};

/** Miniatury produktu bez tła i ramek — czyste zdjęcie, spójne w całym ERP/WMS. */
export function ProductThumb({ imageUrl, name, size = "md", className = "" }: Props) {
  const dim = SIZE_CLASS[size];
  const src = (imageUrl ?? "").trim();

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? ""}
        className={`${dim} shrink-0 object-contain ${className}`.trim()}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center text-slate-300 ${className}`.trim()}
      aria-hidden={!name}
      title={name}
    >
      {size === "sm" ? <Package className="h-5 w-5" strokeWidth={1.5} /> : <ImageIcon className="h-6 w-6" strokeWidth={1.5} />}
    </div>
  );
}
