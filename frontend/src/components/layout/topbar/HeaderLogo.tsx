import { Link } from "react-router-dom";

/** Enterprise mark: orange warehouse outline + SASIST wordmark. */
export default function HeaderLogo() {
  return (
    <Link
      to="/dashboard"
      className="group flex shrink-0 items-center gap-2.5 rounded-xl py-1 pr-1 transition-colors duration-150 ease-out hover:bg-[#F8FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
      title="Sasist — panel"
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#F97316]/40 bg-white text-[#F97316] transition-colors duration-150 group-hover:border-[#F97316]"
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.5 10.5 12 4.5l8.5 6v8.25a1.25 1.25 0 0 1-1.25 1.25H4.75A1.25 1.25 0 0 1 3.5 18.75V10.5Z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 20V12h5v8" />
        </svg>
      </span>
      <span className="text-[15px] font-bold tracking-[0.08em] text-[#0F172A]">SASIST</span>
    </Link>
  );
}
