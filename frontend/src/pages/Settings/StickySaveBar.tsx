type StickySaveBarProps = {
  saving?: boolean;
  onCancel: () => void;
  onSave: () => void;
  className?: string;
  /** When false, bar collapses with slide animation (no reserved space). */
  visible?: boolean;
};

export default function StickySaveBar({
  saving,
  onCancel,
  onSave,
  className = "",
  visible = true,
}: StickySaveBarProps) {
  return (
    <div
      className={`shrink-0 transition-all duration-200 ease-out ${
        visible ? "h-24 opacity-100" : "h-0 opacity-0"
      }${className ? ` ${className}` : ""}`}
    >
      <div
        className={`fixed inset-x-0 bottom-0 z-40 px-6 pb-4 transition-all duration-200 ease-out ${
          visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
        }`}
        role="region"
        aria-label="Niezapisane zmiany"
        aria-hidden={!visible}
      >
        <div className="mx-auto max-w-[1600px] rounded-xl border-t border-slate-200 bg-white/95 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div className="min-w-0 text-sm font-medium text-amber-700">Masz niezapisane zmiany</div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                disabled={saving}
                onClick={onCancel}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                disabled={saving}
                onClick={onSave}
              >
                {saving ? "Zapisywanie…" : "Zapisz"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
