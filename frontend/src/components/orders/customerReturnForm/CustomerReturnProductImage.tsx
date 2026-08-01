import { ImageIcon } from "lucide-react";
import { useState } from "react";

type Props = {
  url: string | null;
  name: string;
  sizeClass?: string;
};

/** Frameless product image — object-contain, placeholder when missing. */
export function CustomerReturnProductImage({ url, name, sizeClass = "h-20 w-20" }: Props) {
  const [broken, setBroken] = useState(false);

  if (!url || broken) {
    return (
      <div
        className={`flex ${sizeClass} shrink-0 items-center justify-center text-slate-300`}
        aria-hidden
      >
        <ImageIcon className="h-8 w-8" strokeWidth={1.25} />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={name}
      className={`${sizeClass} shrink-0 object-contain`}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
