import type { ComponentProps } from "react";
import { Link } from "react-router-dom";

import { operationalActionButtonClass } from "./operationalActionButtonTokens";

/** Same chrome as `OperationalActionButton` for router links in action grids. */
export function OperationalActionLink({ className = "", ...rest }: ComponentProps<typeof Link>) {
  return <Link className={`${operationalActionButtonClass} ${className}`.trim()} {...rest} />;
}
