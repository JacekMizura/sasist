import { Package, Plus } from "lucide-react";
import { memo, type MutableRefObject } from "react";
import { Link } from "react-router-dom";

import { brandPrimaryButtonClass } from "../../design-system/brandUi";
import { listSellasistToolbarToggleBtn } from "../listPage/listSellasistTokens";
import { ModuleListPageToolbar } from "../listPage/moduleList";
import { WMS_ROUTES } from "../../pages/wms/wmsRoutes";

type Props = {
  loading: boolean;
  resultCount: number;
  activeFilterLabel: string;
  filtersExpanded: boolean;
  onToggleFilters: () => void;
  openFilterFieldsRef: MutableRefObject<(() => void) | null>;
  onNewComplaint: () => void;
};

function ComplaintsListToolbarInner({ onNewComplaint, ...props }: Props) {
  return (
    <ModuleListPageToolbar
      title="Reklamacje"
      settingsHref="/settings/complaints/ui-statuses"
      settingsTitle="Ustawienia statusów reklamacji"
      headerActions={
        <>
          <button type="button" onClick={onNewComplaint} className={brandPrimaryButtonClass} title="Utwórz reklamację">
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Nowa reklamacja
          </button>
          <Link
            to={WMS_ROUTES.returns}
            className={listSellasistToolbarToggleBtn}
            title="WMS — zwroty / przyjęcia"
          >
            <Package className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            WMS
          </Link>
        </>
      }
      {...props}
    />
  );
}

export const ComplaintsListToolbar = memo(ComplaintsListToolbarInner);
