import { Ruler } from "lucide-react";

import { ListPageHeader } from "../../components/listPage/ListPageHeader";
import PageLayout from "../../components/layout/PageLayout";
import { EmptyState } from "../../design-system";
import { UI_STRINGS } from "../../constants/uiStrings";

/**
 * Asortyment → Tabele rozmiarów — placeholder shell for a future size-chart module.
 */
export default function SizeTablesPage() {
  return (
    <PageLayout>
      <ListPageHeader
        title="Tabele rozmiarów"
        description="Słownik tabel rozmiarów powiązanych z kategoriami i produktami."
        breadcrumbs={[
          { label: UI_STRINGS.navigation.assortment },
          { label: "Tabele rozmiarów" },
        ]}
      />
      <div className="mt-6">
        <EmptyState
          title="Moduł w przygotowaniu"
          description="Tabele rozmiarów będą dostępne w kolejnym etapie — miejsce w Asortymencie jest już zarezerwowane."
          action={
            <span className="inline-flex items-center gap-2 text-sm text-slate-400">
              <Ruler className="h-4 w-4" strokeWidth={2} aria-hidden />
              Wkrótce
            </span>
          }
        />
      </div>
    </PageLayout>
  );
}
