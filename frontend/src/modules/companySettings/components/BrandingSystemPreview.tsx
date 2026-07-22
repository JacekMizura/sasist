type Props = {
  logoSrc: string | null;
  companyName: string;
};

/** Safe preview: logo always via <img> (SVG as image — no inline script execution). */
export function BrandingSystemPreview({ logoSrc, companyName }: Props) {
  const name = companyName.trim() || "Nazwa firmy";
  const today = new Date().toLocaleDateString("pl-PL");

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#0f172a]">
        <p className="border-b border-slate-700/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Logowanie
        </p>
        <div className="flex min-h-[180px] flex-col items-center justify-center px-5 py-6">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="mb-5 max-h-12 max-w-[200px] object-contain" />
          ) : (
            <div className="mb-5 text-sm font-semibold tracking-wide text-slate-300">Logo firmy</div>
          )}
          <div className="h-9 w-full max-w-[220px] rounded-lg bg-slate-800/90" />
          <div className="mt-2 h-9 w-full max-w-[220px] rounded-lg bg-slate-800/90" />
          <div className="mt-4 h-10 w-full max-w-[220px] rounded-lg bg-orange-500" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <p className="border-b border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Sidebar
        </p>
        <div className="flex min-h-[180px]">
          <div className="w-[4.5rem] shrink-0 border-r border-slate-200 bg-slate-100/80 p-2.5">
            {logoSrc ? (
              <img src={logoSrc} alt="" className="mx-auto max-h-8 max-w-full object-contain" />
            ) : (
              <div className="mx-auto h-7 w-7 rounded-full bg-orange-400" />
            )}
            <div className="mt-5 space-y-2">
              <div className="h-2 rounded bg-orange-200" />
              <div className="h-2 rounded bg-slate-200" />
              <div className="h-2 rounded bg-slate-200" />
            </div>
          </div>
          <div className="flex-1 p-3">
            <div className="flex items-center gap-2">
              {logoSrc ? (
                <img src={logoSrc} alt="" className="h-6 max-w-[72px] object-contain" />
              ) : null}
              <p className="truncate text-xs font-semibold text-slate-800">{name}</p>
            </div>
            <div className="mt-4 h-20 rounded-lg bg-slate-200/70" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <p className="border-b border-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Dokument
        </p>
        <div className="min-h-[180px] p-4">
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
            {logoSrc ? (
              <img src={logoSrc} alt="" className="max-h-10 max-w-[130px] object-contain" />
            ) : (
              <div className="text-xs font-semibold text-slate-400">Logo firmy</div>
            )}
            <div className="text-right text-[10px] leading-relaxed text-slate-400">
              FV/2026/001
              <br />
              {today}
            </div>
          </div>
          <p className="mt-3 text-xs font-bold text-slate-900">{name}</p>
          <div className="mt-3 space-y-1.5">
            <div className="h-2 w-full rounded bg-slate-100" />
            <div className="h-2 w-[85%] rounded bg-slate-100" />
            <div className="h-2 w-[70%] rounded bg-slate-100" />
            <div className="mt-2 h-8 w-full rounded bg-slate-50" />
          </div>
        </div>
      </div>
    </div>
  );
}
