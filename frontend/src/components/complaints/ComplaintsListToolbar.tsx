import { Package, Plus } from "lucide-react";
import { memo, type MutableRefObject } from "react";
import { Link } from "react-router-dom";

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

function ComplaintsListToolbarInner({
  onNewComplaint,
  ...props
}: Props) {
  return (
    <ModuleListPageToolbar
      title="Reklamacje"
      settingsHref="/settings/complaints/ui-statuses"
      settingsTitle="Ustawienia statusów reklamacji"
      filtersToggleLabelCollapsed="Dodatkowe filtry"
      headerActions={
        <>
          <button
            type="button"
            onClick={onNewComplaint}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Nowa reklamacja
          </button>
          <Link
            to={WMS_ROUTES.returns}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
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
