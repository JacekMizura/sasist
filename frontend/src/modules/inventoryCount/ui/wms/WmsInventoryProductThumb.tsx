import { Image as ImageIcon } from "lucide-react";

import { WMS_PRODUCT_CARD_IMG_BOX } from "@/components/wms/WmsProductCard";

type Props = {
  url?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASS = {
  sm: "h-10 w-14",
  md: "h-[72px] w-[72px]",
  lg: "h-[100px] w-[100px]",
} as const;

/** Product image tile — same chrome as putaway / receiving WMS cards. */
export default function WmsInventoryProductThumb({ url, name, size = "md", className = "" }: Props) {
  const box = `${WMS_PRODUCT_CARD_IMG_BOX} ${SIZE_CLASS[size]} ${className}`.trim();

  return (
    <div className={box}>
      {url ? (
        <img src={url} alt="" className="max-h-full max-w-full object-contain object-center" loading="lazy" />
      ) : (
        <span className="flex flex-col items-center gap-1 text-[10px] font-medium text-slate-400">
          <ImageIcon className="h-4 w-4" strokeWidth={1.5} />
          Brak zdjęcia
        </span>
      )}
      <span className="sr-only">{name ?? "Produkt"}</span>
    </div>
  );
}
