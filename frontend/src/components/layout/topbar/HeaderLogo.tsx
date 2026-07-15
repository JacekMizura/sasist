import { Link } from "react-router-dom";

import markUrl from "../../../assets/logo/sasist-mark.svg";

type Props = {
  /** Tighter mark + wordmark for sidebar next to hamburger. */
  compact?: boolean;
  /** Hexagon mark only (collapsed sidebar). */
  markOnly?: boolean;
};

/** Orange hexagon „S” + SASIST wordmark (font-weight 800). */
export default function HeaderLogo({ compact = false, markOnly = false }: Props) {
  if (markOnly) {
    return (
      <Link
        to="/dashboard"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-opacity duration-150 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
        title="Sasist — panel"
        aria-label="Sasist — panel"
      >
        <img src={markUrl} alt="" className="h-8 w-8" draggable={false} />
      </Link>
    );
  }

  return (
    <Link
      to="/dashboard"
      className={[
        "group flex min-w-0 items-center rounded-xl transition-colors duration-150 ease-out hover:bg-[#EFF6FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]",
        compact ? "gap-2 py-1 pl-0.5 pr-1" : "gap-2.5 py-1 pr-1",
      ].join(" ")}
      title="Sasist — panel"
      aria-label="Sasist — panel"
    >
      <img
        src={markUrl}
        alt=""
        className={compact ? "h-8 w-8 shrink-0" : "h-9 w-9 shrink-0"}
        draggable={false}
      />
      <span
        className={[
          "truncate font-extrabold tracking-[0.12em] text-slate-900",
          compact ? "text-[15px]" : "text-base",
        ].join(" ")}
      >
        SASIST
      </span>
    </Link>
  );
}
