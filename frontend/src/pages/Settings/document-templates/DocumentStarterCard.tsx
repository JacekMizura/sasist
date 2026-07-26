import { Link } from "react-router-dom";

import type { StarterGalleryItem } from "@/api/documentTemplatesApi";
import { StarterThumbnailImage } from "./components/StarterThumbnailImage";
import { LIST_BASE } from "./constants";

const CATEGORY_LABELS: Record<string, string> = {
  featured: "Polecane",
  recent: "Nowe",
  popular: "Najpopularniejsze",
};

type Props = {
  item: StarterGalleryItem;
  onUse: (item: StarterGalleryItem) => void;
};

/**
 * Ready Templates layout (Label System) — large preview, roomy body, two outline CTAs.
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
      className="group relative flex h-[300px] flex-col overflow-hidden border border-[#E5E7EB] bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-orange-300 hover:shadow-md"
      style={{ borderRadius: 16 }}
    >
      <Link
        to={`${LIST_BASE}/starters/${item.id}`}
        className="relative block h-[48%] shrink-0 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400"
      >
        <StarterThumbnailImage
          starterId={item.id}
          alt={item.name_pl}
          className="h-full w-full border-b border-[#E5E7EB] object-cover object-top"
        />
        {tags.length > 0 ? (
          <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </Link>

      <div className="flex min-h-0 flex-1 flex-col p-5">
        <h3 className="line-clamp-1 text-sm font-semibold text-slate-900">{item.name_pl}</h3>
        <p className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-slate-500">
          {item.description || item.family_name || "Gotowy układ dokumentu"}
        </p>
        <p className="mt-2 text-xs text-gray-500">{item.kind_name}</p>
        <div className="mt-3 flex gap-2">
          <Link
            to={`${LIST_BASE}/starters/${item.id}`}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-800 shadow-sm transition hover:border-orange-300 hover:shadow-md"
          >
            Szczegóły
          </Link>
          <button
            type="button"
            onClick={() => onUse(item)}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-orange-300 hover:shadow-md"
          >
            Użyj szablonu
          </button>
        </div>
      </div>
    </article>
  );
}
