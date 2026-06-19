import { Plus } from "lucide-react";
import { memo, type MutableRefObject } from "react";
import { Link } from "react-router-dom";

import { ModuleListPageToolbar } from "../../listPage/moduleList";
import { OrderListMultiActionsMenu, type MultiMenuActionId } from "./OrderListMultiActionsMenu";
import type { OrderQuickToolbarActionKind } from "./orderQuickActionKinds";

type Props = {
  loading: boolean;
  resultCount: number;
  activeFilterLabel: string;
  filtersExpanded: boolean;
  onToggleFilters: () => void;
  openFilterFieldsRef: MutableRefObject<(() => void) | null>;
  tableDensityCompact: boolean;
  onToggleTableDensity: () => void;
  onOpenColumnPicker: () => void;
  bulkBusy?: boolean;
  onExport: () => void;
  onRefresh: () => void;
  onMultiMenuSelect: (id: MultiMenuActionId) => void;
  onQuickAction: (kind: OrderQuickToolbarActionKind) => void;
};

function OrdersListMoreMenuItems({
  tableDensityCompact,
  onToggleTableDensity,
  onExport,
  onRefresh,
  onMultiMenuSelect,
  onQuickAction,
  bulkBusy,
}: Pick<
  Props,
  | "tableDensityCompact"
  | "onToggleTableDensity"
  | "onExport"
  | "onRefresh"
  | "onMultiMenuSelect"
  | "onQuickAction"
  | "bulkBusy"
>) {
  const menuBtn =
    "flex w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <>
      <button type="button" className={menuBtn} onClick={onToggleTableDensity}>
        {tableDensityCompact ? "Rzadszy układ wierszy" : "Gęstszy układ wierszy"}
      </button>
      <button type="button" className={menuBtn} onClick={onExport} disabled={bulkBusy}>
        Eksportuj zaznaczenie
      </button>
      <button type="button" className={menuBtn} onClick={onRefresh} disabled={bulkBusy}>
        Odśwież listę
      </button>
      <button
        type="button"
        className={menuBtn}
        disabled={bulkBusy}
        onClick={() => onQuickAction("issue_document")}
      >
        Wystaw dokument
      </button>
      <button
        type="button"
        className={menuBtn}
        disabled={bulkBusy}
        onClick={() => onQuickAction("send_message")}
      >
        Wyślij wiadomość
      </button>
      <div className="px-3 py-1.5">
        <OrderListMultiActionsMenu disabled={bulkBusy} onSelect={onMultiMenuSelect} />
      </div>
    </>
  );
}

function OrdersListToolbarInner({
  tableDensityCompact,
  onToggleTableDensity,
  onOpenColumnPicker,
  bulkBusy,
  onExport,
  onRefresh,
  onMultiMenuSelect,
  onQuickAction,
  ...props
}: Props) {
  return (
    <ModuleListPageToolbar
      title="Zamówienia"
      settingsHref="/settings/orders/ui-statuses"
      settingsTitle="Ustawienia statusów panelu"
      columnsDisabled={false}
      onColumnsClick={onOpenColumnPicker}
      moreMenuItems={
        <OrdersListMoreMenuItems
          tableDensityCompact={tableDensityCompact}
          onToggleTableDensity={onToggleTableDensity}
          onExport={onExport}
          onRefresh={onRefresh}
          onMultiMenuSelect={onMultiMenuSelect}
          onQuickAction={onQuickAction}
          bulkBusy={bulkBusy}
        />
      }
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
