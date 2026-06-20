type Props = {
  logoSrc: string | null;
  companyName: string;
};

export function BrandingSystemPreview({ logoSrc, companyName }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
        <p className="border-b border-slate-700 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Logowanie</p>
        <div className="flex min-h-[160px] flex-col items-center justify-center px-4 py-6">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="mb-4 max-h-12 max-w-[180px] object-contain" />
          ) : (
            <div className="mb-4 h-10 w-32 rounded bg-slate-700" />
          )}
          <div className="h-8 w-full max-w-[200px] rounded-md bg-slate-800" />
          <div className="mt-2 h-8 w-full max-w-[200px] rounded-md bg-slate-800" />
          <div className="mt-4 h-9 w-full max-w-[200px] rounded-md bg-orange-500/90" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sidebar</p>
        <div className="flex min-h-[160px]">
          <div className="w-14 shrink-0 border-r border-slate-100 bg-slate-50 p-2">
            {logoSrc ? (
              <img src={logoSrc} alt="" className="mx-auto max-h-8 max-w-full object-contain" />
            ) : (
              <div className="mx-auto h-6 w-8 rounded bg-slate-200" />
            )}
            <div className="mt-4 space-y-2">
              <div className="h-2 rounded bg-orange-200" />
              <div className="h-2 rounded bg-slate-200" />
              <div className="h-2 rounded bg-slate-200" />
            </div>
          </div>
          <div className="flex-1 p-3">
            <p className="text-xs font-semibold text-slate-800">{companyName || "Nazwa firmy"}</p>
            <div className="mt-3 h-16 rounded-lg border border-dashed border-slate-200 bg-slate-50" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <p className="border-b border-slate-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Dokument</p>
        <div className="min-h-[160px] p-4">
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
            {logoSrc ? (
              <img src={logoSrc} alt="" className="max-h-10 max-w-[120px] object-contain" />
            ) : (
              <div className="h-8 w-24 rounded bg-slate-100" />
            )}
            <div className="text-right text-[10px] text-slate-400">
              FV/2026/001
              <br />
              {new Date().toLocaleDateString("pl-PL")}
            </div>
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-800">{companyName || "Nazwa firmy"}</p>
          <div className="mt-2 space-y-1">
            <div className="h-2 w-full rounded bg-slate-100" />
            <div className="h-2 w-4/5 rounded bg-slate-100" />
            <div className="h-2 w-3/5 rounded bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
