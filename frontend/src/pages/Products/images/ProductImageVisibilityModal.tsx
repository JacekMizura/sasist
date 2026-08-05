import { useMemo, useState } from "react";

import type { ProductImageEntry } from "../../../types/productLabel";
import { Checkbox } from "../../../design-system";
import {
  DEFAULT_PRODUCT_IMAGE_VISIBILITY,
  PRODUCT_IMAGE_VISIBILITY_CHANNELS,
  resolveImageVisibility,
  type ProductImageVisibilityChannelId,
} from "./productImageVisibility";
import { GalleryModalSaveButton, ProductGalleryModalShell } from "./ProductGalleryModalShell";

type Props = {
  /** Single image, or null when applying to a selection of ids. */
  image: ProductImageEntry | null;
  selectedIds: string[];
  images: ProductImageEntry[];
  onClose: () => void;
  onSave: (ids: string[], visibility: ProductImageVisibilityChannelId[]) => void;
};

export function ProductImageVisibilityModal({ image, selectedIds, images, onClose, onSave }: Props) {
  const targetIds = image ? [image.id] : selectedIds;
  const seed = useMemo(() => {
    if (image) return resolveImageVisibility(image.visibility);
    if (selectedIds.length === 1) {
      const one = images.find((i) => i.id === selectedIds[0]);
      return resolveImageVisibility(one?.visibility);
    }
    return [...DEFAULT_PRODUCT_IMAGE_VISIBILITY];
  }, [image, selectedIds, images]);

  const [checked, setChecked] = useState<Set<string>>(() => new Set(seed));

  const byGroup = useMemo(() => {
    const map = new Map<string, typeof PRODUCT_IMAGE_VISIBILITY_CHANNELS[number][]>();
    for (const ch of PRODUCT_IMAGE_VISIBILITY_CHANNELS) {
      const list = map.get(ch.group) ?? [];
      list.push(ch);
      map.set(ch.group, list);
    }
    return [...map.entries()];
  }, []);

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ProductGalleryModalShell
      title="Ustaw widoczność"
      onClose={onClose}
      wide
      footer={
        <GalleryModalSaveButton
          onClick={() => {
            const ids = PRODUCT_IMAGE_VISIBILITY_CHANNELS.map((c) => c.id).filter((id) => checked.has(id));
            onSave(targetIds, ids.length ? ids : [...DEFAULT_PRODUCT_IMAGE_VISIBILITY]);
            onClose();
          }}
        />
      }
    >
      <p className="mb-4 text-xs text-slate-500">
        {targetIds.length === 1
          ? "Wybierz, gdzie to zdjęcie ma być widoczne."
          : `Zmiana dotyczy ${targetIds.length} zaznaczonych zdjęć.`}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {byGroup.map(([group, channels]) => (
          <div key={group} className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {group}
            </div>
            <ul className="space-y-2 p-3">
              {channels.map((ch) => (
                <li key={ch.id}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <Checkbox
                      checked={checked.has(ch.id)}
                      onChange={() => toggle(ch.id)}
                      className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: ch.color }}
                      aria-hidden
                    />
                    {ch.label}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Sklepy
          </div>
          <p className="p-3 text-xs text-slate-400">Brak podłączonych sklepów.</p>
        </div>
      </div>
    </ProductGalleryModalShell>
  );
}
