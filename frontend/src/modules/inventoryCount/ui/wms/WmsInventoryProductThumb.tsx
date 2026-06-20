import { Image as ImageIcon } from "lucide-react";

type Props = {
  url?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASS = {
  sm: "h-10 w-10",
  md: "h-[72px] w-[72px]",
  lg: "h-[100px] w-[100px]",
} as const;

/** Miniatury produktu WMS — bez tła i ramek. */
export default function WmsInventoryProductThumb({ url, name, size = "md", className = "" }: Props) {
  const dim = SIZE_CLASS[size];
  const src = (url ?? "").trim();

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? ""}
        className={`${dim} shrink-0 object-contain object-center ${className}`.trim()}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={`${dim} flex shrink-0 flex-col items-center justify-center gap-1 text-slate-300 ${className}`.trim()}
      aria-hidden={!name}
    >
      <ImageIcon className="h-4 w-4" strokeWidth={1.5} />
      <span className="sr-only">{name ?? "Produkt"}</span>
    </div>
  );
}
