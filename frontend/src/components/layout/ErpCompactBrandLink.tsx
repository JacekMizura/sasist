import { Link } from "react-router-dom";

import SasistLogo from "./SasistLogo";

/** Brand link in the ERP left sidebar header. */
export default function ErpCompactBrandLink() {
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
