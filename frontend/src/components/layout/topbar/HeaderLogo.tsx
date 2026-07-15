import { Link } from "react-router-dom";

type Props = {
  /** Tighter mark for sidebar header next to hamburger. */
  compact?: boolean;
};

/** Enterprise mark: orange warehouse outline + SASIST wordmark. */
export default function HeaderLogo({ compact = false }: Props) {
  return (
    <Link
      to="/dashboard"
      className={[
        "group flex min-w-0 items-center rounded-xl transition-colors duration-150 ease-out hover:bg-[#EFF6FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]",
        compact ? "gap-2 py-1 pl-0.5 pr-1" : "gap-2.5 py-1 pr-1",
      ].join(" ")}
      title="Sasist — panel"
    >
      <span
        className={[
          "flex shrink-0 items-center justify-center rounded-[10px] border border-[#F97316]/45 bg-white text-[#F97316]",
          compact ? "h-8 w-8" : "h-9 w-9",
        ].join(" ")}
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.5 10.5 12 4.5l8.5 6v8.25a1.25 1.25 0 0 1-1.25 1.25H4.75A1.25 1.25 0 0 1 3.5 18.75V10.5Z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 20V12h5v8" />
        </svg>
      </span>
      <span
        className={[
          "truncate font-bold tracking-[0.08em] text-[#0F172A]",
          compact ? "text-[14px]" : "text-[15px]",
        ].join(" ")}
      >
        SASIST
      </span>
    </Link>
  );
}
