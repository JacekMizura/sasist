import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { Image as ImageIcon } from "lucide-react";

import { GhostButton, Input, PrimaryButton, Radio, SecondaryButton } from "../../design-system";
import type { ProductImageEntry } from "../../types/productLabel";
import { ensureSingleMainImage } from "../../utils/productLabelMetadata";

export type ProductEditImagesTabProps = {
  productImages: ProductImageEntry[];
  setProductImages: Dispatch<SetStateAction<ProductImageEntry[]>>;
  newGalleryUrl: string;
  setNewGalleryUrl: (v: string) => void;
  galleryUploadBusy: boolean;
  onAddFromUrl: () => void;
  onFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  onSetMain: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
};

/**
 * Product edit — Zdjęcia tab.
 * DOM hierarchy is a structural 1:1 port of `zdjecia karta produktu.html`.
 */
export function ProductEditImagesTab({
  productImages,
  setProductImages,
  newGalleryUrl,
  setNewGalleryUrl,
  galleryUploadBusy,
  onAddFromUrl,
  onFileSelected,
  onSetMain,
  onMove,
  onRemove,
}: ProductEditImagesTabProps) {
  const images = ensureSingleMainImage(productImages).sort((a, b) => a.sort_order - b.sort_order);

  return (
    /* mock: <main class="… max-w-7xl mx-auto"> */
    <div className="mx-auto w-full max-w-7xl">
      <div
        style={{
          background: "#ff0000",
          color: "white",
          fontSize: 32,
          padding: 20,
          fontWeight: "bold",
        }}
      >
        ==============================
        <br />
        TEST ZDJĘCIA TAB
        <br />
        ==============================
      </div>
      <h2 className="mb-6 text-lg font-bold text-gray-900">Galeria produktu</h2>

      <div className="max-w-4xl space-y-6">
        {/* BOX 1: Dodawanie zdjęcia */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <label className="mb-3 block text-sm font-semibold text-gray-800">Dodaj zdjęcie z adresu URL</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="url"
              density="comfortable"
              focusTone="brand"
              className="flex-1 placeholder:text-gray-400"
              value={newGalleryUrl}
              onChange={(e) => setNewGalleryUrl(e.target.value)}
              placeholder="https://... lub /uploads/..."
            />
            <div className="flex gap-3">
              <PrimaryButton
                type="button"
                density="compact"
                disabled={!newGalleryUrl.trim()}
                onClick={onAddFromUrl}
                className="!rounded-lg !bg-orange-300 !px-5 !py-2 !text-sm !font-medium !text-white hover:!bg-orange-400 disabled:opacity-50"
              >
                Dodaj URL
              </PrimaryButton>
              <SecondaryButton
                type="button"
                density="compact"
                className="relative !rounded-lg !border-gray-200 !bg-white !px-5 !py-2 !text-sm !font-medium !text-gray-700 shadow-sm hover:!bg-gray-50"
                disabled={galleryUploadBusy}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  onChange={onFileSelected}
                  disabled={galleryUploadBusy}
                  aria-label="Wgraj z pliku"
                />
                {galleryUploadBusy ? "Wgrywanie…" : "Wgraj z pliku"}
              </SecondaryButton>
            </div>
          </div>
        </div>

        {/* Lista zdjęć — rekordy jak w mocku */}
        {images.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center shadow-sm">
            <p className="text-sm font-medium text-gray-500">Brak zdjęć w galerii.</p>
            <p className="mt-1 text-xs text-gray-400">Użyj opcji powyżej, aby dodać pierwsze zdjęcie.</p>
          </div>
        ) : (
          images.map((img) => (
            <div
              key={img.id}
              className="flex flex-col items-start gap-6 rounded-xl border border-gray-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center"
            >
              {/* Miniaturka */}
              <div className="flex h-24 w-32 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-white">
                {img.image_url.trim() ? (
                  <img src={img.image_url} alt="" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center bg-gray-50 text-gray-300">
                    <ImageIcon className="mb-1 h-8 w-8" strokeWidth={1.5} aria-hidden />
                    <span className="text-[10px] font-medium uppercase tracking-wider">Zdjęcie</span>
                  </div>
                )}
              </div>

              {/* URL + akcje */}
              <div className="min-w-0 w-full flex-1">
                <Input
                  type="url"
                  density="comfortable"
                  focusTone="neutral"
                  className="mb-3 text-gray-700"
                  value={img.image_url}
                  onChange={(e) =>
                    setProductImages((prev) =>
                      ensureSingleMainImage(
                        prev.map((x) => (x.id === img.id ? { ...x, image_url: e.target.value } : x)),
                      ),
                    )
                  }
                />

                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex cursor-pointer items-center font-medium text-blue-600">
                    <Radio
                      name="product-main-image"
                      checked={img.is_main}
                      onChange={() => onSetMain(img.id)}
                      className="mr-2 h-4 w-4 cursor-pointer border-gray-300 bg-gray-100 text-blue-600 focus:ring-blue-500"
                    />
                    Główne zdjęcie
                  </label>

                  <div className="mx-1 hidden h-4 w-px bg-gray-200 sm:block" />

                  <GhostButton
                    type="button"
                    density="compact"
                    onClick={() => onMove(img.id, -1)}
                    className="!px-0 !py-0 text-xs font-medium uppercase tracking-wider !text-gray-500 hover:!bg-transparent hover:!text-gray-800"
                  >
                    W górę
                  </GhostButton>
                  <GhostButton
                    type="button"
                    density="compact"
                    onClick={() => onMove(img.id, 1)}
                    className="!px-0 !py-0 text-xs font-medium uppercase tracking-wider !text-gray-500 hover:!bg-transparent hover:!text-gray-800"
                  >
                    W dół
                  </GhostButton>

                  <div className="mx-1 hidden h-4 w-px bg-gray-200 sm:block" />

                  <GhostButton
                    type="button"
                    density="compact"
                    onClick={() => onRemove(img.id)}
                    className="!px-0 !py-0 text-xs font-medium uppercase tracking-wider !text-red-500 hover:!bg-transparent hover:!text-red-700"
                  >
                    Usuń zdjęcie
                  </GhostButton>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
