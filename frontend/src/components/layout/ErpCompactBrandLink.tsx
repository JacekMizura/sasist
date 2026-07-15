import { Link } from "react-router-dom";

import SasistLogo from "./SasistLogo";

type Props = {
  /** Icon-only mark when ERP sidebar is collapsed. */
  collapsed?: boolean;
};

/** Brand link in the ERP left sidebar header. */
export default function ErpCompactBrandLink({ collapsed = false }: Props) {
  return (
    <Link
      to="/dashboard"
      className={[
        "flex min-w-0 items-center rounded-lg transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]",
        collapsed ? "h-10 w-10 justify-center" : "h-full w-full px-1",
      ].join(" ")}
      title="Sasist — panel"
      aria-label="Sasist — panel"
    >
      <SasistLogo markOnly={collapsed} className={collapsed ? "h-8 w-8" : "h-8 w-auto max-w-full"} />
    </Link>
  );
}
