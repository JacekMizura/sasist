import { useEffect } from "react";
import { useTranslation } from "../../../locales";

/** Modal podglądu zdjęcia wózka – tytuł, obraz lub „Brak zdjęcia”, zamykanie Escape/klik. */

type ImagePreviewModalProps = {
  open: boolean;
  imageUrl: string | null;
  title?: string;
  onClose: () => void;
};

export default function ImagePreviewModal({ open, imageUrl, title, onClose }: ImagePreviewModalProps) {
  const t = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="font-black text-slate-800 uppercase text-xs tracking-widest">{title ?? t.preview}</div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black"
            aria-label={t.close}
          >
            ✕
          </button>
        </div>
        <div className="bg-slate-50">
          {imageUrl ? (
            <img src={imageUrl} alt={title ?? t.preview} className="w-full max-h-[70vh] object-contain" />
          ) : (
            <div className="p-16 text-center text-slate-300 font-black uppercase text-xs tracking-widest">
              {t.noImage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

