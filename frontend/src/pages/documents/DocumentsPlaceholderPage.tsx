import { Link } from "react-router-dom";
import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { Construction } from "lucide-react";

import DocumentsEmptyState from "./DocumentsEmptyState";
import { DocumentsSectionShell } from "./DocumentsSectionShell";
import { DocumentsTableCard } from "./documentsDashboardPrimitives";

type Props = {
  title: string;
  /** Optional primary navigation (e.g. pola dodatkowe zamówień). */
  hintLabel?: string;
  hintTo?: string;
};

export default function DocumentsPlaceholderPage({ title, hintLabel, hintTo }: Props) {
  return (
    <DocumentsSectionShell
      title={title}
    >
      <DocumentsTableCard>
        <DocumentsEmptyState
          icon={Construction}
          title="Sekcja w przygotowaniu"
          description="Funkcje dokumentowe będą stopniowo podłączane do magazynu i sprzedaży. Na razie nie ma tu danych do wyświetlenia."
          action={
            hintLabel && hintTo ? (
              <Link
                to={hintTo}
                className={brandPrimaryButtonClass}
              >
                {hintLabel}
              </Link>
            ) : undefined
          }
        />
      </DocumentsTableCard>
    </DocumentsSectionShell>
  );
}
