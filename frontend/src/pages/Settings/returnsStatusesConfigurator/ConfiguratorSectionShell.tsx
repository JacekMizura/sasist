import type { ReactNode } from "react";

import { FlatPageSection } from "../../../components/layout/FlatPageSection";

type Props = {
  id?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
};

export function ConfiguratorSectionShell(props: Props) {
  return <FlatPageSection {...props} />;
}

/** Etykieta widoczności w magazynie — jeden wariant w całym module. */
export const WMS_VISIBILITY_LABEL = "Widoczne w magazynie";
