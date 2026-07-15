import { Link } from "react-router-dom";

import SasistLogo from "./SasistLogo";

type Props = {
  /** Icon-only mark when ERP sidebar is collapsed. */
  collapsed?: boolean;
};

/** Brand link in the ERP left sidebar header. */
export default function ErpCompactBrandLink({ collapsed = false }: Props) {
  if (collapsed) {
    return (
      <Link
        to="/dashboard"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-sm font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
        title="Sasist — panel"
        aria-label="Sasist — panel"
      >
        S
      </Link>
    );
  }

  return (
    <Link
      to="/dashboard"
      className="flex h-full w-full min-w-0 items-center rounded-lg px-1 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
      title="Sasist — panel"
    >
      <SasistLogo className="h-8 w-auto max-w-full" />
    </Link>
  );
}
