/** Minimal operational shell for flows not yet implemented — large type, touch-friendly spacing. */
export default function WmsFlowPlaceholder({
  title,
  hint = "W przygotowaniu",
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex min-h-[min(60vh,480px)] flex-col items-center justify-center gap-3 px-6 py-16">
      <h2 className="text-center text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
      <p className="max-w-md text-center text-base leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}
