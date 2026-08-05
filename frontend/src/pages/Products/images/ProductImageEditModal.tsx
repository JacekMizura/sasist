import { useState } from "react";
import { Trash2 } from "lucide-react";

import type { ProductImageEntry } from "../../../types/productLabel";
import { Input, SecondaryButton, Textarea } from "../../../design-system";
import { PRODUCT_IMAGE_SURFACE_CLASS } from "../../../utils/productImageSurface";
import { GalleryModalSaveButton, ProductGalleryModalShell } from "./ProductGalleryModalShell";

type Props = {
  image: ProductImageEntry;
  onClose: () => void;
  onSave: (id: string, patch: Pick<ProductImageEntry, "title" | "description" | "link_url" | "image_url">) => void;
  onDelete: (id: string) => void;
  onOpenVisibility: () => void;
};

export function ProductImageEditModal({ image, onClose, onSave, onDelete, onOpenVisibility }: Props) {
  const [title, setTitle] = useState(image.title ?? "");
  const [description, setDescription] = useState(image.description ?? "");
  const [linkUrl, setLinkUrl] = useState(image.link_url ?? "");
  const [imageUrl, setImageUrl] = useState(image.image_url);

  return (
    <ProductGalleryModalShell
      title="Edytuj plik"
      onClose={onClose}
      wide
      footer={
        <GalleryModalSaveButton
          onClick={() => {
            onSave(image.id, {
              title: title.trim() || undefined,
              description: description.trim() || undefined,
              link_url: linkUrl.trim() || undefined,
              image_url: imageUrl.trim(),
            });
            onClose();
          }}
        />
      }
    >
      <div className="flex flex-col gap-5 sm:flex-row">
        <div
          className={`flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 sm:h-44 sm:w-44 ${PRODUCT_IMAGE_SURFACE_CLASS}`}
        >
          {imageUrl.trim() ? (
            <img src={imageUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-slate-400">Brak podglądu</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap gap-2">
            <SecondaryButton type="button" density="compact" onClick={onOpenVisibility}>
              Ustaw widoczność
            </SecondaryButton>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("Usunąć to zdjęcie z galerii?")) return;
                onDelete(image.id);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Usuń
            </button>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Adres URL</label>
            <Input
              type="url"
              density="comfortable"
              focusTone="brand"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Tytuł</label>
            <Input
              type="text"
              density="comfortable"
              focusTone="brand"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Generowany automatycznie"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Opis</label>
            <Textarea
              density="comfortable"
              focusTone="brand"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Generowany automatycznie"
              className="min-h-[72px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Link</label>
            <Input
              type="url"
              density="comfortable"
              focusTone="brand"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Adres URL po kliknięciu"
            />
          </div>
        </div>
      </div>
    </ProductGalleryModalShell>
  );
}
