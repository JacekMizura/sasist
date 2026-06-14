import { productLikeInputClass } from "./productLikeTokens";
import { ensureSingleMainImage } from "../../utils/productLabelMetadata";

type Props = {
  title?: string;
  images: ProductImageEntry[];
  newUrl: string;
  uploadBusy: boolean;
  onNewUrlChange: (v: string) => void;
  onAddUrl: () => void;
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSetMain: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  onUpdateUrl: (id: string, url: string) => void;
};

/**
 * Galeria zdjęć współdzielona przez produkt i zestaw (zakładka Zdjęcia).
 */
export function CatalogEntityGallerySection({
  title = "Galeria",
  images,
  newUrl,
  uploadBusy,
  onNewUrlChange,
  onAddUrl,
  onFileSelected,
  onSetMain,
  onMove,
  onRemove,
  onUpdateUrl,
}: Props) {
  const fieldLabel = productLikeFieldLabelClass;
  const inputClass = productLikeInputClass;
  const sorted = ensureSingleMainImage(images);

  return (
    <div className="w-full xl:max-w-4xl space-y-12">
      <section>
        <h3 className="mb-5 border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">{title}</h3>
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-3 rounded border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="min-w-[200px] flex-1">
              <label className="mb-2 block text-sm font-medium text-slate-700">Dodaj zdjęcie z adresu URL</label>
              <input
                type="url"
                className={inputClass}
                value={newUrl}
                onChange={(e) => onNewUrlChange(e.target.value)}
                placeholder="https://... lub /uploads/..."
              />
            </div>
            <button
              type="button"
              onClick={onAddUrl}
              disabled={!newUrl.trim()}
              className="rounded bg-slate-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
            >
              Dodaj URL
            </button>
            <label className="inline-flex cursor-pointer items-center justify-center rounded border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
              <input type="file" accept="image/*" className="sr-only" onChange={onFileSelected} disabled={uploadBusy} />
              {uploadBusy ? "Wgrywanie…" : "Wgraj z pliku"}
            </label>
          </div>

          {sorted.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
              <p className="text-sm font-medium text-slate-500">Brak zdjęć w galerii.</p>
              <p className="mt-1 text-xs text-slate-400">Użyj opcji powyżej, aby dodać pierwsze zdjęcie.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {sorted.map((img) => (
                <li
                  key={img.id}
                  className="flex flex-col gap-6 rounded border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center"
                >
                  <div className="flex w-24 shrink-0 items-center justify-center overflow-hidden bg-white">
                    <img src={img.image_url} alt="" className="max-h-24 max-w-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-4">
                    <input
                      type="url"
                      className={inputClass}
                      value={img.image_url}
                      onChange={(e) => onUpdateUrl(img.id, e.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-4 text-sm font-medium">
                      <label className="flex cursor-pointer items-center gap-2 text-blue-700">
                        <input
                          type="radio"
                          name="catalog-main-image"
                          className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={img.is_main}
                          onChange={() => onSetMain(img.id)}
                        />
                        Główne zdjęcie
                      </label>
                      <div className="hidden h-4 w-px bg-slate-200 sm:block" />
                      <div className="flex items-center gap-4">
                        <button type="button" className="text-slate-600 transition-colors hover:text-slate-900" onClick={() => onMove(img.id, -1)}>
                          W górę
                        </button>
                        <button type="button" className="text-slate-600 transition-colors hover:text-slate-900" onClick={() => onMove(img.id, 1)}>
                          W dół
                        </button>
                      </div>
                      <div className="hidden h-4 w-px bg-slate-200 sm:block" />
                      <button type="button" className="text-rose-600 transition-colors hover:text-rose-800" onClick={() => onRemove(img.id)}>
                        Usuń zdjęcie
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
