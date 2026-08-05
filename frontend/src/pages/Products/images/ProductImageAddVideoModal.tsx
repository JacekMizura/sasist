import { useState } from "react";

import type { ProductImageEntry } from "../../../types/productLabel";
import { Input } from "../../../design-system";
import { GalleryModalSaveButton, ProductGalleryModalShell } from "./ProductGalleryModalShell";

type Props = {
  image: ProductImageEntry;
  onClose: () => void;
  onSave: (id: string, videoUrl: string) => void;
};

export function ProductImageAddVideoModal({ image, onClose, onSave }: Props) {
  const [url, setUrl] = useState(image.video_url ?? "");

  return (
    <ProductGalleryModalShell
      title="Dodaj film"
      onClose={onClose}
      footer={
        <GalleryModalSaveButton
          label="Zapisz film"
          disabled={!url.trim()}
          onClick={() => {
            onSave(image.id, url.trim());
            onClose();
          }}
        />
      }
    >
      <div className="mb-4 rounded-lg border border-orange-100 bg-orange-50/60 px-3 py-2.5 text-xs leading-relaxed text-slate-700">
        Dodając film do zdjęcia spowodujesz, że zamiast zdjęcia będzie wyświetlany film, a samo zdjęcie
        stanie się jego obrazem podglądu.
      </div>
      <label className="mb-1 block text-xs font-medium text-slate-700">Adres URL filmu</label>
      <Input
        type="url"
        density="comfortable"
        focusTone="brand"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://… (mp4 / YouTube / Vimeo)"
      />
    </ProductGalleryModalShell>
  );
}
