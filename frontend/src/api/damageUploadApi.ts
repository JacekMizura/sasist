import api from "./axios";



/** Accept only `/uploads/…` paths. */

export function normalizeWmsUploadUrl(url: unknown): string | null {

  if (typeof url !== "string") return null;

  const u = url.trim();

  if (!u) return null;

  if (u.startsWith("/uploads/")) return u;

  return null;

}



/**

 * POST /api/uploads — multipart field `file`.

 * Response: `{ url: "/uploads/..." }`.

 */

export async function uploadDamageImageFile(file: File): Promise<string> {

  const fd = new FormData();

  fd.append("file", file);



  const res = await api.post<{ url?: string }>("uploads", fd);



  if (typeof res.data !== "object" || !res.data?.url) {

    throw new Error("Invalid upload response");

  }



  const path = normalizeWmsUploadUrl(res.data.url);

  if (!path) {

    throw new Error("Invalid upload response");

  }

  return path;

}

