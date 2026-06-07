import { Package } from "lucide-react";

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

export function ProductThumb({ imageUrl, name, size = "md", className = "" }: Props) {
  const box = `${SIZE_CLASS[size]} shrink-0 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center ${className}`;
  if (imageUrl?.trim()) {
    return <img src={imageUrl} alt={name ?? ""} className={`${box} object-contain p-1`} />;
  }
  return (
    <div className={`${box} text-slate-300`} aria-hidden>
      <Package className="h-1/2 w-1/2" />
    </div>
  );
}
