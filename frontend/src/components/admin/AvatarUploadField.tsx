import { useCallback, useEffect, useId, useState } from "react";
import { Camera, Trash2, Upload } from "lucide-react";

import { getBackendPublicOrigin } from "../../config/apiBase";

export function resolvePublicUploadUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const origin = typeof window !== "undefined" ? getBackendPublicOrigin() : "";
  const base = (origin || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!base) return p;
  return `${base}${p}`;
}

type Props = {
  initials: string;
  storedUrl: string | null | undefined;
  pendingFile: File | null;
  onPickFile: (file: File | null) => void;
  onClearStored: () => void;
  disabled?: boolean;
  helperAfterCreate?: string;
};

export default function AvatarUploadField({
  initials,
  storedUrl,
  pendingFile,
  onPickFile,
  onClearStored,
  disabled,
  helperAfterCreate,
}: Props) {
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFile) {
      setBlobUrl(null);
      return undefined;
    }
    const u = URL.createObjectURL(pendingFile);
    setBlobUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [pendingFile]);

  const resolvedStored = resolvePublicUploadUrl(storedUrl ?? "");
  const displaySrc = blobUrl || resolvedStored;
  const showImage = Boolean(blobUrl || (storedUrl && storedUrl.trim().length > 0));

  const onFiles = useCallback(
    (files: FileList | null) => {
      const f = files?.[0];
      if (!f || !f.type.startsWith("image/")) return;
      onPickFile(f);
    },
    [onPickFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      onFiles(e.dataTransfer.files);
    },
    [disabled, onFiles],
  );

  const removeAll = () => {
    onPickFile(null);
    onClearStored();
  };

  return (
    <div className="space-y-3">
      <div
        role="presentation"
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 transition ${
          dragOver ? "border-slate-800 bg-white ring-1 ring-slate-300" : "border-slate-200 bg-white"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <div className="relative">
          {showImage ? (
            <img src={displaySrc || undefined} alt="" className="h-28 w-28 rounded-2xl object-cover shadow-md ring-2 ring-white" />
          ) : (
            <div
              className="flex h-28 w-28 items-center justify-center rounded-xl border border-slate-200 bg-white text-2xl font-semibold text-slate-600"
              aria-hidden
            >
              {initials.slice(0, 2)}
            </div>
          )}
          <label
            htmlFor={inputId}
            className={`absolute -bottom-2 -right-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-slate-900 text-white shadow-lg ring-4 ring-white transition hover:bg-slate-800 ${
              disabled ? "pointer-events-none opacity-50" : ""
            }`}
            title="Wybierz zdjęcie"
          >
            <Camera className="h-5 w-5" aria-hidden />
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>

        <p className="mt-6 text-center text-sm font-medium text-slate-700">Przeciągnij zdjęcie lub kliknij ikonę aparatu</p>
        <p className="mt-1 text-center text-xs leading-relaxed text-slate-500">JPEG, PNG, WebP lub GIF · max ok. 4 MB</p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <label
            htmlFor={inputId}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 ${
              disabled ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Upload className="h-4 w-4" aria-hidden />
            Wybierz plik
          </label>
          {(pendingFile || storedUrl) && (
            <button
              type="button"
              disabled={disabled}
              onClick={removeAll}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Usuń zdjęcie
            </button>
          )}
        </div>
      </div>
      {helperAfterCreate ? <p className="text-xs leading-relaxed text-slate-500">{helperAfterCreate}</p> : null}
    </div>
  );
}
