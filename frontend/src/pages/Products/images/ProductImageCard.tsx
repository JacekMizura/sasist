import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MoreVertical, Play, Trash2 } from "lucide-react";

import type { ProductImageEntry } from "../../../types/productLabel";
import { Checkbox } from "../../../design-system";
import { PRODUCT_IMAGE_SURFACE_CLASS } from "../../../utils/productImageSurface";
import { resolveImageVisibility, PRODUCT_IMAGE_VISIBILITY_CHANNELS } from "./productImageVisibility";

type Props = {
  image: ProductImageEntry;
  selected: boolean;
  onToggleSelect: () => void;
  onSetMain: () => void;
  onMove: (dir: -1 | 1) => void;
  onEdit: () => void;
  onVisibility: () => void;
  onAddVideo: () => void;
  onDelete: () => void;
};

export function ProductImageCard({
  image,
  selected,
  onToggleSelect,
  onSetMain,
  onMove,
  onEdit,
  onVisibility,
  onAddVideo,
  onDelete,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const visibility = resolveImageVisibility(image.visibility);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className={`group relative aspect-square ${PRODUCT_IMAGE_SURFACE_CLASS}`}>
        {image.image_url.trim() ? (
          <img src={image.image_url} alt={image.title || ""} className="h-full w-full object-contain p-2" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">Brak podglądu</div>
        )}

        {image.video_url?.trim() ? (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            <Play className="h-3 w-3" strokeWidth={2} aria-hidden />
            Film
          </span>
        ) : null}

        <div className="absolute left-2 top-2 z-10">
          <Checkbox
            checked={selected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-slate-300 bg-white text-orange-600 shadow-sm focus:ring-orange-500"
            aria-label="Zaznacz zdjęcie"
          />
        </div>

        <div className="absolute inset-x-0 top-0 flex items-start justify-center pt-2 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white/95 px-1 py-0.5 shadow-sm">
            <button
              type="button"
              title="Przesuń w lewo"
              onClick={onMove.bind(null, -1)}
              className="rounded p-1 text-slate-600 hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
            <span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden />
            <button
              type="button"
              title="Przesuń w prawo"
              onClick={onMove.bind(null, 1)}
              className="rounded p-1 text-slate-600 hover:bg-slate-100"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>

        <div className="absolute right-2 top-2 z-10" ref={menuRef}>
          <button
            type="button"
            title="Więcej"
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <MoreVertical className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
              >
                Edytuj
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setMenuOpen(false);
                  onVisibility();
                }}
              >
                Ustaw widoczność
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setMenuOpen(false);
                  onAddVideo();
                }}
              >
                Dodaj film
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Usuń
              </button>
            </div>
          ) : null}
        </div>

        <div className="absolute bottom-2 left-2 flex flex-col gap-1">
          {PRODUCT_IMAGE_VISIBILITY_CHANNELS.filter((c) => visibility.includes(c.id)).map((ch) => (
            <span
              key={ch.id}
              title={ch.label}
              className="h-2 w-2 rounded-full ring-1 ring-white/80"
              style={{ backgroundColor: ch.color }}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 p-2">
        {image.is_main ? (
          <div className="flex w-full items-center justify-center rounded-lg bg-orange-50 px-2 py-2 text-xs font-semibold text-orange-700">
            ✓ Główne
          </div>
        ) : (
          <button
            type="button"
            onClick={onSetMain}
            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Ustaw jako główne
          </button>
        )}
      </div>
    </div>
  );
}
