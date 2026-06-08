/** Authenticated blob download helpers for inventory ERP exports. */

function parseContentDispositionFilename(header: string | undefined): string | null {
  if (!header) return null;
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(header);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1].replace(/"/g, "").trim());
  } catch {
    return match[1].replace(/"/g, "").trim();
  }
}

export function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function parseBlobErrorMessage(blob: Blob): Promise<string> {
  try {
    const text = await blob.text();
    const parsed = JSON.parse(text) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (parsed.detail && typeof parsed.detail === "object" && "message" in parsed.detail) {
      return String((parsed.detail as { message: string }).message);
    }
  } catch {
    /* not json */
  }
  return "Nie udało się pobrać pliku.";
}

export function resolveDownloadFilename(
  headers: Record<string, string | undefined>,
  fallback: string,
): string {
  return parseContentDispositionFilename(headers["content-disposition"]) ?? fallback;
}
