type Props = {
  count: number;
};

/** Ostatnia komórka stripa: „+N innych”. */
export function ProductOverflow({ count }: Props) {
  return (
    <div
      className="relative flex h-[4.5rem] min-w-[6rem] shrink-0 items-center justify-center self-start rounded-lg border-2 border-slate-200 bg-white px-3 sm:min-w-[6.5rem]"
      aria-hidden
    >
      <div className="absolute inset-0 rounded-lg bg-slate-50/90" />
      <span className="relative text-center text-sm font-bold leading-tight text-[#222] sm:text-base">+{count} innych</span>
    </div>
  );
}
