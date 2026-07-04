import { Plus } from "lucide-react";
import { memo, type MutableRefObject, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ModuleListPageToolbar } from "../../listPage/moduleList";

type Props = {
  loading: boolean;
  resultCount: number;
  activeFilterLabel: string;
  filtersExpanded: boolean;
  onToggleFilters: () => void;
  openFilterFieldsRef: MutableRefObject<(() => void) | null>;
  onOpenColumnPicker: () => void;
  viewControls?: ReactNode;
};

function OrdersListToolbarInner({ onOpenColumnPicker, viewControls, ...props }: Props) {
  return (
    <ModuleListPageToolbar
      title="Zamówienia"
      settingsHref="/settings/orders/ui-statuses"
      settingsTitle="Ustawienia statusów panelu"
      columnsDisabled={false}
      onColumnsClick={onOpenColumnPicker}
      extraToolbarControls={viewControls}
      headerActions={
        <Link
          to="/orders/new"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
        >
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Nowe zamówienie
        </Link>
      }
      {...props}
    />
  );
}

export const OrdersListToolbar = memo(OrdersListToolbarInner);
