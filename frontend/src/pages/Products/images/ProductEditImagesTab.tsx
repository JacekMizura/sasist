import { useMemo, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { Checkbox, Input, PrimaryButton, SecondaryButton } from "../../../design-system";
import type { ProductImageEntry } from "../../../types/productLabel";
import { ensureSingleMainImage } from "../../../utils/productLabelMetadata";
import { ProductImageAddVideoModal } from "./ProductImageAddVideoModal";
import { ProductImageCard } from "./ProductImageCard";
import { ProductImageEditModal } from "./ProductImageEditModal";
import { ProductImageVisibilityModal } from "./ProductImageVisibilityModal";
import type { ProductImageVisibilityChannelId } from "./productImageVisibility";

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

type ModalState =
  | { kind: "edit"; id: string }
  | { kind: "visibility"; id?: string }
  | { kind: "video"; id: string }
  | null;

/**
 * Product gallery — Sellasist-like actions, Sasist visual language.
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const images = useMemo(
    () => ensureSingleMainImage(productImages).sort((a, b) => a.sort_order - b.sort_order),
    [productImages],
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [modal, setModal] = useState<ModalState>(null);
  const [addOpen, setAddOpen] = useState(false);

  const allSelected = images.length > 0 && images.every((i) => selected.has(i.id));
  const selectedIds = useMemo(() => [...selected].filter((id) => images.some((i) => i.id === id)), [selected, images]);

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(images.map((i) => i.id)));
  };

  const patchImage = (id: string, patch: Partial<ProductImageEntry>) => {
    setProductImages((prev) =>
      ensureSingleMainImage(prev.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    );
  };

  const applyVisibility = (ids: string[], visibility: ProductImageVisibilityChannelId[]) => {
    setProductImages((prev) =>
      ensureSingleMainImage(
        prev.map((x) => (ids.includes(x.id) ? { ...x, visibility: [...visibility] } : x)),
      ),
    );
    toast.success(ids.length === 1 ? "Widoczność zapisana" : `Widoczność zapisana (${ids.length})`);
  };

  const bulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Usunąć ${selectedIds.length} zaznaczonych zdjęć?`)) return;
    setProductImages((prev) => ensureSingleMainImage(prev.filter((x) => !selectedIds.includes(x.id))));
    setSelected(new Set());
    toast.success("Usunięto zaznaczone zdjęcia");
  };

  const modalImage =
    modal && (modal.kind === "edit" || modal.kind === "video" || (modal.kind === "visibility" && modal.id))
      ? images.find((i) => i.id === (modal.kind === "visibility" ? modal.id : modal.id)) ?? null
      : null;

  return (
    <div className="w-full max-w-none space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-900">Galeria</h2>
          <button
            type="button"
            title="Dodaj zdjęcie"
            onClick={() => setAddOpen((o) => !o)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton
            type="button"
            density="compact"
            disabled={selectedIds.length === 0}
            onClick={() => setModal({ kind: "visibility" })}
          >
            Ustaw widoczność
          </SecondaryButton>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={bulkDelete}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Usuń
          </button>
        </div>
      </div>

      {addOpen ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-semibold text-slate-800">Dodaj zdjęcie</label>
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
            <div className="flex gap-2">
              <PrimaryButton type="button" density="compact" disabled={!newGalleryUrl.trim()} onClick={onAddFromUrl}>
                Dodaj URL
              </PrimaryButton>
              <SecondaryButton
                type="button"
                density="compact"
                disabled={galleryUploadBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                {galleryUploadBusy ? "Wgrywanie…" : "Wgraj z pliku"}
              </SecondaryButton>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onFileSelected}
                disabled={galleryUploadBusy}
              />
            </div>
          </div>
        </div>
      ) : null}

      {images.length > 0 ? (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <Checkbox
            checked={allSelected}
            onChange={toggleAll}
            className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
          />
          Zaznacz wszystkie zdjęcia
        </label>
      ) : null}

      {images.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-5 py-14 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-500">Brak zdjęć w galerii.</p>
          <p className="mt-1 text-xs text-slate-400">Kliknij + aby dodać pierwsze zdjęcie.</p>
          <PrimaryButton type="button" density="compact" className="mt-4" onClick={() => setAddOpen(true)}>
            Dodaj zdjęcie
          </PrimaryButton>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {images.map((img) => (
            <ProductImageCard
              key={img.id}
              image={img}
              selected={selected.has(img.id)}
              onToggleSelect={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(img.id)) next.delete(img.id);
                  else next.add(img.id);
                  return next;
                })
              }
              onSetMain={() => onSetMain(img.id)}
              onMove={(dir) => onMove(img.id, dir)}
              onEdit={() => setModal({ kind: "edit", id: img.id })}
              onVisibility={() => setModal({ kind: "visibility", id: img.id })}
              onAddVideo={() => setModal({ kind: "video", id: img.id })}
              onDelete={() => {
                if (!window.confirm("Usunąć to zdjęcie?")) return;
                onRemove(img.id);
                setSelected((prev) => {
                  const next = new Set(prev);
                  next.delete(img.id);
                  return next;
                });
              }}
            />
          ))}
        </div>
      )}

      {modal?.kind === "edit" && modalImage ? (
        <ProductImageEditModal
          image={modalImage}
          onClose={() => setModal(null)}
          onSave={(id, patch) => patchImage(id, patch)}
          onDelete={(id) => {
            onRemove(id);
            setSelected((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }}
          onOpenVisibility={() => setModal({ kind: "visibility", id: modalImage.id })}
        />
      ) : null}

      {modal?.kind === "visibility" ? (
        <ProductImageVisibilityModal
          image={modal.id ? images.find((i) => i.id === modal.id) ?? null : null}
          selectedIds={modal.id ? [modal.id] : selectedIds}
          images={images}
          onClose={() => setModal(null)}
          onSave={applyVisibility}
        />
      ) : null}

      {modal?.kind === "video" && modalImage ? (
        <ProductImageAddVideoModal
          image={modalImage}
          onClose={() => setModal(null)}
          onSave={(id, videoUrl) => {
            patchImage(id, { video_url: videoUrl || undefined });
            toast.success(videoUrl ? "Film przypisany do zdjęcia" : "Film usunięty");
          }}
        />
      ) : null}
    </div>
  );
}
