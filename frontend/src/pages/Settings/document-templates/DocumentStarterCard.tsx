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
 * Compact starter card — Label System ReadyTemplateCard language, lower height.
 */
export function DocumentStarterCard({ item, onUse }: Props) {
  const tags = [
    ...(item.is_system ? ["System"] : []),
    ...(item.categories ?? []).map((c) => CATEGORY_LABELS[c] ?? c),
    ...(item.tags ?? []).slice(0, 3),
  ].filter(Boolean);

  return (
    <article
      className="group relative flex h-[220px] flex-col overflow-hidden border border-[#E5E7EB] bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-orange-300 hover:shadow-md"
      style={{ borderRadius: 16 }}
    >
      <Link to={`${LIST_BASE}/starters/${item.id}`} className="relative block h-[58%] shrink-0 border-b border-[#E5E7EB] bg-white">
        <StarterThumbnailImage
          starterId={item.id}
          alt={item.name_pl}
          className="h-full w-full object-cover object-top"
        />
        <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm"
            >
              {tag}
            </span>
          ))}
        </div>
      </Link>

      <div className="flex min-h-0 flex-1 flex-col px-3.5 pb-3 pt-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.kind_name}</p>
        <h3 className="mt-0.5 line-clamp-1 text-sm font-semibold text-slate-900">{item.name_pl}</h3>
        <p className="mt-0.5 line-clamp-1 flex-1 text-xs leading-snug text-slate-500">
          {item.description || item.family_name}
        </p>
        <div className="mt-2 flex gap-2">
          <Link
            to={`${LIST_BASE}/starters/${item.id}`}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-center text-xs font-semibold text-slate-800 shadow-sm transition hover:border-orange-300 hover:shadow-md"
          >
            Szczegóły
          </Link>
          <button
            type="button"
            onClick={() => onUse(item)}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-orange-300 hover:shadow-md"
          >
            Użyj szablonu
          </button>
        </div>
      </div>
    </article>
  );
}
