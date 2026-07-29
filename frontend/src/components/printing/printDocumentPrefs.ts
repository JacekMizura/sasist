/** Remember last print template + workstation per document type key. */

const STORAGE_KEY = "sasist_print_document_prefs_v1";

export type PrintDocumentPref = {
  templateVersionId?: number | null;
  workstationId?: number | null;
};

type PrefMap = Record<string, PrintDocumentPref>;

function readAll(): PrefMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PrefMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: PrefMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

export function getPrintDocumentPref(documentTypeKey: string): PrintDocumentPref {
  const key = documentTypeKey.trim();
  if (!key) return {};
  return readAll()[key] ?? {};
}

export function savePrintDocumentPref(
  documentTypeKey: string,
  patch: PrintDocumentPref,
): void {
  const key = documentTypeKey.trim();
  if (!key) return;
  const all = readAll();
  all[key] = { ...all[key], ...patch };
  writeAll(all);
}
