import { Link } from "react-router-dom";
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
      subtitle="Ten obszar zostanie rozbudowany w kolejnych iteracjach — layout jest już zsynchronizowany z resztą WMS."
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
                className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
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
