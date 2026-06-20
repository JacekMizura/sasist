import { firstProductImageUrl } from "../panelList/ProductListItem";

/** Szerokość kolumny zdjęcia na liście produktów (h-20 / w-20). */
export const PRODUCT_LIST_PHOTO_COL_PX = 80;

/**
 * Miniatura produktu — identyczna jak kolumna „Zdjęcie” w Asortyment → Produkty.
 */
export function ProductListPhotoCell({ imageUrl }: { imageUrl?: string | null }) {
  const imgUrl = firstProductImageUrl(imageUrl ?? null);
  return (
    <div className="mx-auto flex h-20 w-20 max-h-20 max-w-20 items-center justify-center bg-transparent">
      {imgUrl ? (
        <img
          src={imgUrl}
          alt=""
          className="max-h-20 max-w-20 object-contain object-center"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      ) : (
        <span className="text-center text-xs leading-tight text-slate-400">—</span>
      )}
    </div>
  );
}
