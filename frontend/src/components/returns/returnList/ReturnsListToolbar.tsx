import { Plus } from "lucide-react";
import { memo, type MutableRefObject } from "react";
import { Link } from "react-router-dom";

import { ModuleListPageToolbar } from "../../listPage/moduleList";
import { brandPrimaryButtonClass } from "../../../design-system/brandUi";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";

type Props = {
  loading: boolean;
  resultCount: number;
  activeFilterLabel: string;
  filtersExpanded: boolean;
  onToggleFilters: () => void;
  openFilterFieldsRef: MutableRefObject<(() => void) | null>;
  onColumnsClick?: () => void;
  columnsDisabled?: boolean;
};

function ReturnsListToolbarInner({ onColumnsClick, columnsDisabled = false, ...props }: Props) {
  return (
    <ModuleListPageToolbar
      title="Zwroty"
      settingsHref="/orders/returns/statuses"
      settingsTitle="Ustawienia statusów zwrotów"
      onColumnsClick={onColumnsClick}
      columnsDisabled={columnsDisabled}
      headerActions={
        <Link to={WMS_ROUTES.returns} className={brandPrimaryButtonClass} title="Utwórz zwrot">
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Dodaj zwrot
        </Link>
      }
      {...props}
    />
  );
}

export const ReturnsListToolbar = memo(ReturnsListToolbarInner);
