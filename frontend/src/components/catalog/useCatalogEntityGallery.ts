import { useCallback, useState } from "react";

import api from "../../api/axios";
import type { ProductImageEntry } from "../../types/productLabel";
import { ensureSingleMainImage } from "../../utils/productLabelMetadata";

export function useCatalogEntityGallery(initial: ProductImageEntry[] = []) {
  const [images, setImages] = useState<ProductImageEntry[]>(() => ensureSingleMainImage(initial));
  const [newUrl, setNewUrl] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);

  const resetGallery = useCallback((next: ProductImageEntry[]) => {
    setImages(ensureSingleMainImage(next));
    setNewUrl("");
  }, []);

  const addFromUrl = useCallback(() => {
    const u = newUrl.trim();
    if (!u) return;
    setImages((prev) => {
      const sorted = ensureSingleMainImage(prev);
      return ensureSingleMainImage([
        ...sorted,
        {
          id: crypto.randomUUID?.() ?? `img-${Date.now()}`,
          image_url: u,
          is_main: sorted.length === 0,
          sort_order: sorted.length,
        },
      ]);
    });
    setNewUrl("");
  }, [newUrl]);

  const uploadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setUploadBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post<{ url: string }>("/uploads", fd);
      const url = (res.data?.url ?? "").trim();
      if (!url) return;
      setImages((prev) => {
        const sorted = ensureSingleMainImage(prev);
        return ensureSingleMainImage([
          ...sorted,
          {
            id: crypto.randomUUID?.() ?? `img-${Date.now()}`,
            image_url: url,
            is_main: sorted.length === 0,
            sort_order: sorted.length,
          },
        ]);
      });
    } catch {
      window.alert("Nie udało się wgrać zdjęcia (POST /api/uploads).");
    } finally {
      setUploadBusy(false);
    }
  }, []);

  const onFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) await uploadFile(f);
    },
    [uploadFile],
  );

  const setMain = useCallback((id: string) => {
    setImages((prev) => ensureSingleMainImage(prev.map((x) => ({ ...x, is_main: x.id === id }))));
  }, []);

  const remove = useCallback((id: string) => {
    setImages((prev) => ensureSingleMainImage(prev.filter((x) => x.id !== id)));
  }, []);

  const move = useCallback((id: string, dir: -1 | 1) => {
    setImages((prev) => {
      const s = [...prev].sort((a, b) => a.sort_order - b.sort_order);
      const i = s.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.length) return prev;
      [s[i], s[j]] = [s[j], s[i]];
      return ensureSingleMainImage(s.map((img, idx) => ({ ...img, sort_order: idx })));
    });
  }, []);

  const updateUrl = useCallback((id: string, image_url: string) => {
    setImages((prev) => ensureSingleMainImage(prev.map((x) => (x.id === id ? { ...x, image_url } : x))));
  }, []);

  return {
    images,
    setImages,
    resetGallery,
    newUrl,
    setNewUrl,
    uploadBusy,
    addFromUrl,
    onFileInputChange,
    uploadFile,
    setMain,
    remove,
    move,
    updateUrl,
  };
}
