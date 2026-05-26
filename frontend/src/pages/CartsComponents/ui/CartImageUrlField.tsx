import { useCallback, useMemo, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
import { useTranslation } from "../../../locales";
import { getBackendPublicOrigin } from "../../../config/apiBase";
import { uploadCartImageFile } from "../../../api/cartImageUploadApi";

const PREVIEW = 120;
const ACCEPT = "image/jpeg,image/jpg,image/png,image/webp";

function resolvePreviewSrc(raw: string): string | null {
  const u = raw.trim();
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) {
    const origin = getBackendPublicOrigin();
    return origin ? `${origin}${u}` : u;
  }
  return u;
}

type CartImageUrlFieldProps = {
  value: string;
  onChange: (next: string) => void;
  /** Optional class on outer wrapper */
  className?: string;
};

/**
 * Shared cart image control: upload (disk), optional URL, preview, remove.
 */
export default function CartImageUrlField({ value, onChange, className = "" }: CartImageUrlFieldProps) {
  const t = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const previewSrc = useMemo(() => resolvePreviewSrc(value), [value]);

  const runUpload = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      const ok =
        file.type === "image/jpeg" ||
        file.type === "image/jpg" ||
        file.type === "image/png" ||
        file.type === "image/webp";
      if (!ok) {
        window.alert(t.cartImageTypeError);
        return;
      }
      setUploading(true);
      setImgBroken(false);
      try {
        const url = await uploadCartImageFile(file);
        onChange(url);
      } catch {
        window.alert(t.cartImageUploadError);
      } finally {
        setUploading(false);
      }
    },
    [onChange, t],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    void runUpload(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    void runUpload(f);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileRef.current?.click()}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors ${
          dragOver ? "border-blue-500 bg-blue-50/80" : "border-slate-200 bg-slate-50/80 hover:border-slate-300"
        } ${uploading ? "pointer-events-none opacity-70" : ""}`}
        style={{ minHeight: PREVIEW + 24 }}
      >
        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={onInputChange} />
        {previewSrc && !imgBroken ? (
          <img
            src={previewSrc}
            alt=""
            width={PREVIEW}
            height={PREVIEW}
            className="object-contain"
            style={{ maxWidth: PREVIEW, maxHeight: PREVIEW }}
            onError={() => setImgBroken(true)}
            onLoad={() => setImgBroken(false)}
          />
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-1 text-slate-400"
            style={{ width: PREVIEW, height: PREVIEW }}
          >
            <ImageIcon className="h-10 w-10 opacity-60" strokeWidth={1.5} />
            <span className="text-center text-[10px] font-bold uppercase tracking-wide">
              {t.cartImageDrop}
            </span>
          </div>
        )}
        {previewSrc && imgBroken ? (
          <span className="mt-1 text-center text-[10px] text-amber-700">{t.cartImageBroken}</span>
        ) : null}
        {uploading ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 text-sm font-semibold text-slate-700">
            {t.cartImageUploading}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={(e) => {
            e.stopPropagation();
            fileRef.current?.click();
          }}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wide text-slate-800 shadow-sm transition hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
        >
          {t.cartImageUpload}
        </button>
        {value.trim() ? (
          <button
            type="button"
            disabled={uploading}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setImgBroken(false);
            }}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-red-800 hover:bg-red-100 disabled:opacity-50"
          >
            {t.cartImageRemove}
          </button>
        ) : null}
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t.cartImageUrlOptional}</label>
        <input
          type="text"
          className="w-full bg-slate-50 rounded-2xl px-5 py-4 border border-slate-100 font-semibold text-slate-700 outline-none transition-all focus:border-blue-500"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setImgBroken(false);
          }}
          placeholder={t.imageUrlPlaceholder}
          disabled={uploading}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
