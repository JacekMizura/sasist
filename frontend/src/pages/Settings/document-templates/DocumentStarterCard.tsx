import { Link } from "react-router-dom";

import type { StarterGalleryItem } from "@/api/documentTemplatesApi";
import { StarterThumbnailImage } from "./components/StarterThumbnailImage";
import { LIST_BASE } from "./constants";

const CATEGORY_LABELS: Record<string, string> = {
  featured: "Polecane",
  recent: "Nowe",
  popular: "Najpopularniejsze",
};

/** Fixed thumbnail band — identical height/margins on every starter card. */
const THUMB_HEIGHT = "h-[132px]";

const outlineActionClass =
  "flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-center text-xs font-semibold text-slate-800 shadow-sm transition hover:border-orange-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2";

type Props = {
  item: StarterGalleryItem;
  onUse: (item: StarterGalleryItem) => void;
};

/**
 * Product-style starter card — thumbnail → name → description → tags → actions.
 */
export function DocumentStarterCard({ item, onUse }: Props) {
  const tags = [
    item.kind_name,
    ...(item.is_system ? ["System"] : []),
    ...(item.categories ?? []).map((c) => CATEGORY_LABELS[c] ?? c),
    ...(item.tags ?? []).slice(0, 2),
  ].filter(Boolean) as string[];

  return (
    <article
      className="group flex flex-col overflow-hidden border border-[#E5E7EB] bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
      style={{ borderRadius: 16 }}
    >
      <Link
        to={`${LIST_BASE}/starters/${item.id}`}
        className={`relative block ${THUMB_HEIGHT} shrink-0 border-b border-[#E5E7EB] bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400`}
      >
        <StarterThumbnailImage
          starterId={item.id}
          alt={item.name_pl}
          className="h-full w-full object-cover object-top"
        />
      </Link>

      <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-3">
        <h3 className="line-clamp-1 text-sm font-semibold tracking-tight text-slate-900">{item.name_pl}</h3>
        <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-snug text-slate-500">
          {item.description || item.family_name || "Gotowy układ dokumentu"}
        </p>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-gray-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-0.5 flex gap-2">
          <Link to={`${LIST_BASE}/starters/${item.id}`} className={outlineActionClass}>
            Szczegóły
          </Link>
          <button type="button" onClick={() => onUse(item)} className={outlineActionClass}>
            Użyj szablonu
          </button>
        </div>
      </div>
    </article>
  );
}
