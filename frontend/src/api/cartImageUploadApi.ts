import api from "./axios";

/**
 * POST /api/uploads/image — stores under /uploads/carts/; returns `{ url }` for Cart.image_url.
 */
export async function uploadCartImageFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post<{ url: string }>("/uploads/image", fd);
  const url = (res.data?.url ?? "").trim();
  if (!url) throw new Error("Brak URL w odpowiedzi serwera");
  return url;
}
