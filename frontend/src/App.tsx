import { useEffect } from "react"
import { Toaster } from "react-hot-toast"
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  useLocation,
  useParams,
} from "react-router-dom"
import { WarehouseProvider } from "./context/WarehouseContext"
import { AuthProvider } from "./context/AuthContext"
import { CartsRefreshProvider } from "./context/CartsRefreshContext"

import MainPanelLayout from "./layout/MainPanelLayout"
import SettingsAdminLayout from "./layout/SettingsAdminLayout"
import WmsOperationalLayout from "./layout/WmsOperationalLayout"
import ErrorBoundary from "./components/ErrorBoundary"

import Dashboard from "./pages/Dashboard"
import ProductsLayout from "./pages/Products/ProductsLayout"
import ProductList from "./pages/Products/ProductList"
import ProductNewPage from "./pages/Products/ProductNewPage"
import ProductEditPage from "./pages/Products/ProductEditPage"
import ProductDetail from "./pages/Products/ProductDetail"
import ProductProfitabilityPage from "./pages/Products/ProductProfitabilityPage"
import OrdersLayout from "./pages/Orders/OrdersLayout"
import OrderList from "./pages/Orders/OrderList"
import ReturnStatusesPage from "./pages/Orders/ReturnStatusesPage"
import ReturnsHubPage from "./pages/Orders/ReturnsHubPage"
import ReturnsListPanel from "./pages/Orders/ReturnsListPanel"
import ReturnsReturnDetailPage from "./pages/Orders/ReturnsReturnDetailPage"
import CreateOrderPage from "./pages/Orders/CreateOrderPage"
import OrderDetailPage from "./pages/Orders/OrderDetailPage"
import OrderCustomFieldsListPage from "./pages/Orders/OrderCustomFieldsListPage"
import OrderCustomFieldEditPage from "./pages/Orders/OrderCustomFieldEditPage"
import OrderAutomationModuleShell from "./pages/Orders/OrderAutomationModuleShell"
import OrderAutomationListPage from "./pages/Orders/OrderAutomationListPage"
import OrderAutomationLogsPage from "./pages/Orders/OrderAutomationLogsPage"
import OrderAutomationEditorPage from "./pages/Orders/OrderAutomationEditorPage"
import OrderAutomationGroupsPage from "./pages/Orders/OrderAutomationGroupsPage"
import {
  RedirectAssortmentRuleEditToInventory,
  RedirectLegacyAutomationRuleEdit,
} from "./pages/Orders/orderAutomationRouteRedirects"
import SettingsImportPage from "./pages/Settings/SettingsImportPage"
import CompanySettingsPage from "./pages/Settings/CompanySettingsPage"
import CartsLayout from "./pages/CartsLayout"
import CartsBulk from "./pages/CartsBulk"
import CartsBaskets from "./pages/CartsBaskets"
import CartsRacks from "./pages/CartsRacks"
import CartsZones from "./pages/CartsZones"
import LoginPage from "./pages/LoginPage"
import PasswordChangeGate from "./components/auth/PasswordChangeGate"
import AdministratorsPage from "./pages/Settings/AdministratorsPage"
import WorkforceUserGroupsPage from "./pages/Settings/WorkforceUserGroupsPage"
import AdministratorCreatePage from "./pages/Settings/AdministratorCreatePage"
import AdministratorsLayout from "./pages/Settings/AdministratorsLayout"
import AdministratorsModuleFrame from "./pages/Settings/AdministratorsModuleFrame"
import AdministratorsAuditPage from "./pages/Settings/AdministratorsAuditPage"
import EmployeeCostsOverviewPage from "./pages/Settings/EmployeeCostsOverviewPage"
import WorkforceLayout from "./pages/Settings/WorkforceLayout"
import WorkforceDashboardPage from "./pages/Settings/WorkforceDashboardPage"
import WorkforceActivityPage from "./pages/Settings/WorkforceActivityPage"
import PrintersPage from "./pages/Settings/PrintersPage"
import WmsSettingsPage from "./pages/Settings/WmsSettingsPage"
import ReturnsModuleLayout from "./pages/Orders/ReturnsModuleLayout"
import ReturnsModuleSettingsTabPage from "./pages/Orders/ReturnsModuleSettingsTabPage"
import ReturnPanelUiStatusesSettingsPage from "./pages/Settings/ReturnPanelUiStatusesSettingsPage"
import OrderPanelUiStatusesSettingsPage from "./pages/Settings/OrderPanelUiStatusesSettingsPage"
import ComplaintPanelUiStatusesSettingsPage from "./pages/Settings/ComplaintPanelUiStatusesSettingsPage"
import ShippingMethodsSettingsPage from "./pages/Settings/ShippingMethodsSettingsPage"
import ExportsPage from "./pages/Settings/ExportsPage"
import ExportEditorPage from "./pages/Settings/ExportEditorPage"
import DocumentSeriesListPage from "./pages/documents/DocumentSeriesListPage"
import DocumentSeriesEditPage from "./pages/documents/DocumentSeriesEditPage"
import WarehouseMaterialsLayout from "./pages/WarehouseMaterials/WarehouseMaterialsLayout"
import CartonsListPage from "./pages/WarehouseMaterials/CartonsListPage"
import CartonDetailPage from "./pages/WarehouseMaterials/CartonDetailPage"
import WarehouseMaterialsPackagingPage from "./pages/WarehouseMaterials/WarehouseMaterialsPackagingPage"
import PackagingMaterialDetailPage from "./pages/WarehouseMaterials/PackagingMaterialDetailPage"
import ComplaintsLayout from "./pages/Complaints/ComplaintsLayout"
import ComplaintsPanelPage from "./pages/Complaints/ComplaintsPanelPage"
import ComplaintDetailPage from "./pages/Complaints/ComplaintDetailPage"
import Changelog from "./pages/Changelog"
import CartDetails from "./pages/CartDetails"
import FleetPlanner from "./pages/FleetPlanner"
import PickingWaves from "./pages/PickingWaves"
import WarehouseDesigner from "./pages/WarehouseDesigner"
import BarcodeManagement from "./pages/BarcodeManagement"
import LabelSystem from "./pages/LabelSystem"
import MessageTemplatesModule from "./pages/admin/MessageTemplatesModule"
import InventoryList from "./pages/InventoryList"
import SystemLayout from "./pages/System/SystemLayout"
import SystemHealth from "./pages/System/SystemHealth"
import SystemDbSize from "./pages/System/SystemDbSize"
import SystemMetrics from "./pages/System/SystemMetrics"
import SystemErrorLogs from "./pages/System/SystemErrorLogs"
import SystemChangelog from "./pages/System/SystemChangelog"
import PlanningPlaceholder from "./pages/PlanningPlaceholder"
import AnalyticsDashboardPage from "./pages/analytics/AnalyticsDashboard"
import InventoryValue from "./pages/analytics/InventoryValue"
import DeadStock from "./pages/analytics/DeadStock"
import ProductRotation from "./pages/analytics/ProductRotation"
import HotProducts from "./pages/analytics/HotProducts"
import ProductAffinity from "./pages/analytics/ProductAffinity"
import WalkingCost from "./pages/analytics/WalkingCost"
import HotLocations from "./pages/analytics/HotLocations"
import PickDensity from "./pages/analytics/PickDensity"
import WarehouseOperationsPage from "./pages/analytics/WarehouseOperationsPage"
import PickingAnalysis from "./pages/analytics/PickingAnalysis"
import SalesForecastAnalytics from "./pages/analytics/SalesForecast"
import BatchPicking from "./pages/analytics/BatchPicking"
import PickPathSimulation from "./pages/analytics/PickPathSimulation"
import WarehouseDaySimulation from "./pages/analytics/WarehouseDaySimulation"
import PickTimeSimulation from "./pages/analytics/PickTimeSimulation"
import WorkerFlowSimulation from "./pages/analytics/WorkerFlowSimulation"
import Slotting from "./pages/analytics/Slotting"
import PickingStrategy from "./pages/analytics/PickingStrategy"
import LayoutOptimization from "./pages/analytics/LayoutOptimization"
import WarehouseThroughput from "./pages/analytics/WarehouseThroughput"
import WarehouseMap from "./pages/analytics/WarehouseMap"
import PickingIssuesDeadStock from "./pages/analytics/PickingIssuesDeadStock"
import AnalyticsLayout from "./pages/analytics/AnalyticsLayout"
import WarehouseStructureReportPage from "./reports/WarehouseStructureReportPage"
import ProductLocationReportPage from "./reports/ProductLocationReportPage"
import WmsPickingPage from "./pages/wms/WmsPickingPage"
import WmsPickingProductDetailPage from "./pages/wms/WmsPickingProductDetailPage"
import WmsPickingProductsPage from "./pages/wms/WmsPickingProductsPage"
import WmsRecoveryBatchPage from "./pages/wms/WmsRecoveryBatchPage"
import WmsPickingStatusPage from "./pages/wms/WmsPickingStatusPage"
import WmsOrderIssuesHub from "./pages/wms/WmsOrderIssuesHub"
import WmsSupervisorDashboardGate from "./pages/wms/WmsSupervisorDashboardGate"
import WmsOperationalTaskShellPage from "./pages/wms/WmsOperationalTaskShellPage"
import WmsRelocationDetailPage from "./pages/wms/WmsRelocationDetailPage"
import WmsOrderIssueDetailPage from "./pages/wms/WmsOrderIssueDetailPage"
import WmsPickingCartScanPage from "./pages/wms/WmsPickingCartScanPage"
import WmsPickingOrderTypePage from "./pages/wms/WmsPickingOrderTypePage"
import WmsProductPreviewHubPage from "./pages/wms/WmsProductPreviewHubPage"
import WmsProductPreviewPage from "./pages/wms/WmsProductPreviewPage"
import WmsPackingStatusPage from "./pages/wms/WmsPackingStatusPage"
import WmsPackingModePage from "./pages/wms/WmsPackingModePage"
import WmsPackingScanCartPage from "./pages/wms/WmsPackingScanCartPage"
import WmsPackingOrdersPage from "./pages/wms/WmsPackingOrdersPage"
import WmsPackingOrderPage from "./pages/wms/WmsPackingOrderPage"
import WmsDirectSalesPage from "./pages/wms/WmsDirectSalesPage"
import OperationsLayout from "./pages/wms/operations/OperationsLayout"
import OperationsRuntimePage from "./pages/wms/operations/OperationsRuntimePage"
import OperationsReplenishmentPage from "./pages/wms/operations/OperationsReplenishmentPage"
import OperationsOperatorsPage from "./pages/wms/operations/OperationsOperatorsPage"
import OperationsAlertsPage from "./pages/wms/operations/OperationsAlertsPage"
import OperationsTasksPage from "./pages/wms/operations/OperationsTasksPage"
import WmsReceivingPage from "./pages/wms/WmsReceivingPage"
import WmsReceivingCountPage from "./pages/wms/WmsReceivingCountPage"
import WmsIncompleteProductDataPage from "./pages/wms/WmsIncompleteProductDataPage"
import WmsProductDataCompletionPage from "./pages/wms/WmsProductDataCompletionPage"
import WmsPutawayPage from "./pages/wms/WmsPutawayPage"
import WmsPutawayPzPage from "./pages/wms/WmsPutawayPzPage"
import WmsPutawayItemDetailPage from "./pages/wms/WmsPutawayItemDetailPage"
import WmsPutawayExecutePage from "./pages/wms/WmsPutawayExecutePage"
import WmsMenuPage from "./pages/wms/WmsMenuPage"
import WmsMmTransferPage from "./pages/wms/WmsMmTransferPage"
import { WMS_ROUTES } from "./pages/wms/wmsRoutes"
import WarehouseCarriersPage from "./pages/warehouse/WarehouseCarriersPage"
import WarehouseCarrierDetailPage from "./pages/warehouse/WarehouseCarrierDetailPage"
import WmsPhoneUploadPage from "./pages/wms/WmsPhoneUploadPage"
import WmsComplaintDetailPage from "./pages/wms/WmsComplaintDetailPage"
import WmsReturnsPage from "./pages/damage/WmsReturnsPage"
import WmsReturnsEntryPage from "./pages/wms/WmsReturnsEntryPage"
import OfficeDamagesPage from "./pages/damage/OfficeDamagesPage"
import OfficeDamageReportsPage from "./pages/damage/OfficeDamageReportsPage"
import BundlesPage from "./pages/Assortment/BundlesPage"
import ManufacturersPage from "./pages/Assortment/ManufacturersPage"
import SuppliersPage from "./pages/Assortment/SuppliersPage"
import SuppliersLayout from "./pages/Assortment/SuppliersLayout"
import PurchasingLayout from "./pages/purchasing/PurchasingLayout"
import PurchasingDashboardPage from "./pages/purchasing/PurchasingDashboardPage"
import PurchasingAlertsPage from "./pages/purchasing/PurchasingAlertsPage"
import PurchasingAutoReorderPage from "./pages/purchasing/PurchasingAutoReorderPage"
import PurchasingPriceOpportunitiesPage from "./pages/purchasing/PurchasingPriceOpportunitiesPage"
import PurchasingSegmentsPage from "./pages/purchasing/PurchasingSegmentsPage"
import PurchasingSupplierAnalyticsPage from "./pages/purchasing/PurchasingSupplierAnalyticsPage"
import PurchasingPoPage from "./pages/purchasing/PurchasingPoPage"
import PurchasingPoDetailPage from "./pages/purchasing/PurchasingPoDetailPage"
import PurchasingForecastPage from "./pages/purchasing/PurchasingForecastPage"
import PurchasingReplenishmentPage from "./pages/purchasing/PurchasingReplenishmentPage"
import PurchasingCooperationHistoryPage from "./pages/purchasing/PurchasingCooperationHistoryPage"
import CustomersListPage from "./pages/customers/CustomersListPage"
import CustomerEditPage from "./pages/customers/CustomerEditPage"
import PurchaseOrdersPage from "./pages/Assortment/PurchaseOrdersPage"
import ProductsImportTabPage from "./pages/Products/ProductsImportTabPage"
import ProductsImportHistoryTabPage from "./pages/Products/ProductsImportHistoryTabPage"
import ProductCategoriesPage from "./pages/Products/ProductCategoriesPage"
import BdoLayout from "./pages/bdo/BdoLayout"
import BdoDashboardPage from "./pages/bdo/BdoDashboardPage"
import BdoMaterialsPage from "./pages/bdo/BdoMaterialsPage"
import BdoPurchasesPage from "./pages/bdo/BdoPurchasesPage"
import BdoMovementHistoryPage from "./pages/bdo/BdoMovementHistoryPage"
import BdoStockCountPage from "./pages/bdo/BdoStockCountPage"
import BdoMonthlyReportPage from "./pages/bdo/BdoMonthlyReportPage"
import BdoCorrectionsPage from "./pages/bdo/BdoCorrectionsPage"
import BdoSettingsPage from "./pages/bdo/BdoSettingsPage"
import DocumentsLayout from "./pages/documents/DocumentsLayout"
import DocumentsSalesPage from "./pages/documents/DocumentsSalesPage"
import DocumentsCorrectingPage from "./pages/documents/DocumentsCorrectingPage"
import DocumentsWarehousePage from "./pages/documents/DocumentsWarehousePage"
import DocumentsPlaceholderPage from "./pages/documents/DocumentsPlaceholderPage"
import DocumentsExportsHubPage from "./pages/documents/DocumentsExportsHubPage"

function RedirectLegacySettingsDocumentSeriesId() {
  const { legacyId } = useParams<{ legacyId: string }>()
  const to = legacyId ? `/documents/series/${encodeURIComponent(legacyId)}` : "/documents/series"
  return <Navigate to={to} replace />
}

function LegacyPurchaseOrdersRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/goods-orders${search}`} replace />
}

function LegacySuppliersZamowieniaRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/goods-orders${search}`} replace />
}

function RouterMountLogger() {
  useEffect(() => {
    console.log("[ROUTER] mounted");
  }, []);
  return null;
}

function AppRootLayout() {
  console.log("[APP] render")
  return (
    <WarehouseProvider>
      <AuthProvider>
        <CartsRefreshProvider>
          <RouterMountLogger />
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          <PasswordChangeGate />
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </CartsRefreshProvider>
      </AuthProvider>
    </WarehouseProvider>
  )
}

const LEGACY_RETURNS_SETTINGS_SEGMENTS: Record<string, string> = {
  "": "/orders/returns",
  "ui-statuses": "/orders/returns/panel-statuses",
  statusy: "/orders/returns/statuses",
  "rodzaje-zwrotow": "/orders/returns/return-types",
  zrodla: "/orders/returns/sources",
  konfigurator: "/orders/returns/configurator",
  "zwroty-zamowien": "/orders/returns",
}

/** Legacy `/settings/returns/*` → moduł zwrotów pod Zamówienia. */
function LegacySettingsReturnsRedirect() {
  const loc = useLocation()
  const tail = loc.pathname.replace(/^\/settings\/returns\/?/, "").replace(/\/$/, "")
  const to = LEGACY_RETURNS_SETTINGS_SEGMENTS[tail] ?? "/orders/returns"
  return <Navigate to={`${to}${loc.search}`} replace />
}

/** Legacy `/settings/wms/returns/*` → ten sam moduł (zwroty nie są już w ustawieniach WMS). */
function LegacySettingsWmsReturnsRedirect() {
  const loc = useLocation()
  const tail = loc.pathname.replace(/^\/settings\/wms\/returns\/?/, "").replace(/\/$/, "")
  const to = LEGACY_RETURNS_SETTINGS_SEGMENTS[tail] ?? "/orders/returns"
  return <Navigate to={`${to}${loc.search}`} replace />
}

/** Legacy `/administration/templates/messages/*` → `/admin/message-templates/*`. */
function LegacyAdministrationMessageTemplatesRedirect() {
  const loc = useLocation()
  const tail = loc.pathname.replace(/^\/administration\/templates\/messages\/?/, "")
  const to = tail ? `/admin/message-templates/${tail}` : "/admin/message-templates"
  return <Navigate to={`${to}${loc.search}`} replace />
}

/** Legacy `/administration/templates/prints/*` → `/admin/print-templates/*`. */
function LegacyAdministrationPrintTemplatesRedirect() {
  const loc = useLocation()
  const tail = loc.pathname.replace(/^\/administration\/templates\/prints\/?/, "")
  const to = tail ? `/admin/print-templates/${tail}` : "/admin/print-templates"
  return <Navigate to={`${to}${loc.search}`} replace />
}

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<AppRootLayout />}>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="report/warehouse-structure" element={<WarehouseStructureReportPage />} />
      <Route path="report/product-locations" element={<ProductLocationReportPage />} />
      <Route path="wms-upload/:sessionId" element={<WmsPhoneUploadPage />} />
      <Route path="wms" element={<WmsOperationalLayout />}>
        <Route index element={<Navigate to="returns" replace />} />
        <Route path="menu" element={<WmsMenuPage />} />
        <Route path="returns" element={<WmsReturnsEntryPage />} />
        <Route path="returns/process/:returnId" element={<WmsReturnsPage />} />
        <Route path="returns/complaints/:complaintId" element={<WmsComplaintDetailPage />} />
        {/* Kanoniczny URL zgodny z segmentem API ``/wms/receiving/pz/...``; starszy ``/wms/receiving/:id`` zostaje dla zakładek. */}
        <Route path="receiving/pz/:pzId" element={<WmsReceivingCountPage />} />
        <Route path="receiving/:pzId" element={<WmsReceivingCountPage />} />
        <Route path="receiving/incomplete-product-data" element={<WmsIncompleteProductDataPage />} />
        <Route path="product-data-completion" element={<WmsProductDataCompletionPage />} />
        <Route path="receiving" element={<WmsReceivingPage />} />
        <Route path="putaway" element={<WmsPutawayPage />} />
        <Route path="putaway/:pzId/item/:itemId/execute" element={<WmsPutawayExecutePage />} />
        <Route path="putaway/:pzId/item/:itemId" element={<WmsPutawayItemDetailPage />} />
        <Route path="putaway/:pzId" element={<WmsPutawayPzPage />} />
        <Route path="mm/relocation/:pzId/item/:itemId/execute" element={<WmsPutawayExecutePage />} />
        <Route path="mm/relocation/:pzId/item/:itemId" element={<WmsPutawayItemDetailPage />} />
        <Route path="mm/relocation/:pzId" element={<WmsPutawayPzPage />} />
        <Route path="mm" element={<WmsMmTransferPage />} />
        <Route path="replenishment/*" element={<Navigate to="/wms/mm" replace />} />
        {/* Nośniki nie są modułem WMS — legacy URL → przyjęcia (tworzenie / przypisanie tylko z PZ). */}
        <Route path="carriers/*" element={<Navigate to={WMS_ROUTES.receiving} replace />} />
        <Route path="picking" element={<Outlet />}>
          <Route index element={<WmsPickingStatusPage />} />
          <Route path="order-type" element={<WmsPickingOrderTypePage />} />
          <Route path="cart" element={<WmsPickingCartScanPage />} />
          <Route path="products/:productId" element={<WmsPickingProductDetailPage />} />
          <Route path="products" element={<WmsPickingProductsPage />} />
          <Route path="recovery/batch/:batchId" element={<WmsRecoveryBatchPage />} />
          <Route path="recovery/:orderId" element={<WmsPickingProductsPage />} />
          <Route path="locations" element={<WmsPickingPage />} />
        </Route>
        <Route path="operational-queues" element={<Navigate to="/wms/braki" replace />} />
        <Route path="operational-queues/dashboard" element={<WmsSupervisorDashboardGate />} />
        <Route path="operational-queues/task/:taskId" element={<WmsOperationalTaskShellPage />} />
        <Route
          path="operational-queues/relocation/:taskId"
          element={
            <ErrorBoundary>
              <WmsRelocationDetailPage />
            </ErrorBoundary>
          }
        />
        <Route
          path="braki"
          element={
            <ErrorBoundary>
              <WmsOrderIssuesHub />
            </ErrorBoundary>
          }
        />
        <Route
          path="issues"
          element={
            <ErrorBoundary>
              <WmsOrderIssuesHub />
            </ErrorBoundary>
          }
        />
        <Route
          path="issues/task/:taskId"
          element={
            <ErrorBoundary>
              <WmsOrderIssueDetailPage />
            </ErrorBoundary>
          }
        />
        <Route path="product-preview" element={<WmsProductPreviewHubPage />} />
        <Route path="product-preview/:productId" element={<WmsProductPreviewPage />} />
        <Route path="operations" element={<OperationsLayout />}>
          <Route index element={<OperationsRuntimePage />} />
          <Route path="replenishment" element={<OperationsReplenishmentPage />} />
          <Route path="operators" element={<OperationsOperatorsPage />} />
          <Route path="alerts" element={<OperationsAlertsPage />} />
          <Route path="tasks" element={<OperationsTasksPage />} />
        </Route>
        <Route path="direct-sales" element={<WmsDirectSalesPage />} />
        <Route path="packing" element={<Outlet />}>
          <Route index element={<WmsPackingStatusPage />} />
          <Route path="mode" element={<WmsPackingModePage />} />
          <Route path="scan-cart" element={<WmsPackingScanCartPage />} />
          <Route path="orders" element={<WmsPackingOrdersPage />} />
          <Route path="order/:orderId" element={<WmsPackingOrderPage />} />
        </Route>
      </Route>
      <Route element={<SettingsAdminLayout />}>
                <Route path="setup" element={<Navigate to="/settings/company" replace />} />
                <Route path="settings/administrators" element={<AdministratorsLayout />}>
                  <Route element={<AdministratorsModuleFrame />}>
                    <Route index element={<AdministratorsPage />} />
                    <Route path="audit" element={<AdministratorsAuditPage />} />
                    <Route path="groups" element={<WorkforceUserGroupsPage />} />
                    <Route path="costs" element={<EmployeeCostsOverviewPage />} />
                    <Route path="workforce" element={<WorkforceLayout />}>
                      <Route index element={<WorkforceDashboardPage />} />
                      <Route path="activity" element={<WorkforceActivityPage />} />
                      <Route path="status-matrix" element={<Navigate to="/settings/administrators" replace />} />
                    </Route>
                  </Route>
                  {/* Static segments above must win over ``:id`` — in RR7 wzorzec ``:id(\\d+)`` nie dopasowuje się; walidacja liczbowego id w {@link AdministratorEditPage}. */}
                  <Route path="new" element={<AdministratorCreatePage />} />
                  <Route path=":id/edytuj" element={<AdministratorCreatePage />} />
                  <Route path=":id" element={<AdministratorCreatePage />} />
                </Route>
                <Route path="setup/printers" element={<Navigate to="/settings/printers" replace />} />
                <Route path="settings/printers" element={<PrintersPage />} />
                <Route path="settings/wms/returns/*" element={<LegacySettingsWmsReturnsRedirect />} />
                <Route path="settings/wms" element={<WmsSettingsPage />} />
                <Route path="settings/returns/*" element={<LegacySettingsReturnsRedirect />} />
                <Route path="settings/returns" element={<LegacySettingsReturnsRedirect />} />
                <Route path="settings/orders/ui-statuses" element={<OrderPanelUiStatusesSettingsPage />} />
                <Route path="settings/complaints/ui-statuses" element={<ComplaintPanelUiStatusesSettingsPage />} />
                <Route path="settings/shipping-methods" element={<ShippingMethodsSettingsPage />} />
                <Route path="settings/exports" element={<ExportsPage />} />
                <Route path="settings/exports/new" element={<ExportEditorPage />} />
                <Route path="settings/exports/:id" element={<ExportEditorPage />} />
                <Route path="settings/import" element={<SettingsImportPage />} />
                <Route path="settings" element={<Navigate to="/settings/company" replace />} />
                <Route path="settings/company" element={<CompanySettingsPage />} />
                <Route path="settings/document-series" element={<Navigate to="/documents/series" replace />} />
                <Route path="settings/document-series/new" element={<Navigate to="/documents/series/new" replace />} />
                <Route path="settings/document-series/:legacyId" element={<RedirectLegacySettingsDocumentSeriesId />} />
                <Route
                  path="administration/templates/messages/*"
                  element={<LegacyAdministrationMessageTemplatesRedirect />}
                />
                <Route
                  path="administration/templates/prints/*"
                  element={<LegacyAdministrationPrintTemplatesRedirect />}
                />
                <Route path="admin/message-templates/*" element={<MessageTemplatesModule />} />
                <Route path="admin/print-templates/*" element={<LabelSystem />} />
                <Route path="documents" element={<DocumentsLayout />}>
                  <Route index element={<Navigate to="sales/invoices" replace />} />
                  <Route path="sales" element={<Outlet />}>
                    <Route index element={<Navigate to="invoices" replace />} />
                    <Route path="invoices" element={<DocumentsSalesPage />} />
                    <Route path="receipts" element={<DocumentsSalesPage />} />
                  </Route>
                  <Route path="correcting" element={<DocumentsCorrectingPage />} />
                  <Route path="returns" element={<Navigate to="/documents/correcting" replace />} />
                  <Route path="warehouse" element={<Outlet />}>
                    <Route index element={<Navigate to="pz" replace />} />
                    <Route path=":docSegment" element={<DocumentsWarehousePage />} />
                  </Route>
                  <Route path="exports" element={<DocumentsExportsHubPage />} />
                  <Route path="series" element={<DocumentSeriesListPage />} />
                  <Route path="series/new" element={<DocumentSeriesEditPage />} />
                  <Route path="series/:id" element={<DocumentSeriesEditPage />} />
                  <Route path="templates" element={<Navigate to="/admin/message-templates" replace />} />
                  <Route
                    path="custom-fields"
                    element={
                      <DocumentsPlaceholderPage
                        title="Pola własne"
                        hintLabel="Otwórz pola dodatkowe zamówień"
                        hintTo="/orders/custom-fields"
                      />
                    }
                  />
                  <Route path="field-templates" element={<Navigate to="/documents/custom-fields" replace />} />
                  <Route path="ksef" element={<DocumentsPlaceholderPage title="Konta KSeF" />} />
                </Route>
                <Route path="import" element={<Navigate to="/settings/import" replace />} />
                <Route path="import/history" element={<Navigate to="/settings/import?panel=history" replace />} />
      </Route>
      <Route element={<MainPanelLayout />}>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="complaints" element={<ComplaintsLayout />}>
                  <Route index element={<ComplaintsPanelPage />} />
                  <Route path=":id" element={<ComplaintDetailPage />} />
                </Route>
                <Route path="customers" element={<CustomersListPage />} />
                <Route path="customers/new" element={<CustomerEditPage />} />
                <Route path="customers/:id" element={<CustomerEditPage />} />
                <Route path="bundles" element={<BundlesPage />} />
                <Route path="bundles/new" element={<BundlesPage defaultCreateOpen={true} />} />
                <Route path="manufacturers" element={<ManufacturersPage />} />
                <Route path="manufacturers/new" element={<ManufacturersPage defaultCreateOpen={true} />} />
                <Route path="suppliers" element={<SuppliersLayout />}>
                  <Route index element={<SuppliersPage />} />
                  <Route path="new" element={<SuppliersPage defaultCreateOpen={true} />} />
                  <Route path="ocena" element={<PurchasingSupplierAnalyticsPage />} />
                  <Route path="historia" element={<PurchasingCooperationHistoryPage />} />
                </Route>
                <Route path="goods-orders/new" element={<PurchaseOrdersPage defaultCreateOpen />} />
                <Route path="goods-orders" element={<PurchaseOrdersPage />} />
                <Route path="suppliers/zamowienia" element={<LegacySuppliersZamowieniaRedirect />} />
                <Route path="products/profitability" element={<ProductProfitabilityPage />} />
                <Route path="products" element={<ProductsLayout />}>
                  <Route index element={<Navigate to="list" replace />} />
                  <Route path="list" element={<ProductList />} />
                  <Route path="import" element={<ProductsImportTabPage />} />
                  <Route path="kategorie" element={<ProductCategoriesPage />} />
                  <Route path="historia" element={<ProductsImportHistoryTabPage />} />
                  <Route path="new" element={<ProductNewPage />} />
                  <Route path=":id/edit" element={<ProductEditPage />} />
                  <Route path=":id" element={<ProductDetail />} />
                </Route>
                <Route path="warehouse-materials" element={<WarehouseMaterialsLayout />}>
                  <Route index element={<Navigate to="cartons" replace />} />
                  <Route path="cartons" element={<Outlet />}>
                    <Route index element={<CartonsListPage />} />
                    <Route path=":cartonId" element={<CartonDetailPage />} />
                  </Route>
                  <Route path="packaging" element={<Outlet />}>
                    <Route index element={<WarehouseMaterialsPackagingPage />} />
                    <Route path="new" element={<PackagingMaterialDetailPage />} />
                    <Route path=":materialId" element={<PackagingMaterialDetailPage />} />
                  </Route>
                </Route>
                <Route path="warehouse/bdo" element={<BdoLayout />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<BdoDashboardPage />} />
                  <Route path="materials" element={<BdoMaterialsPage />} />
                  <Route path="movements" element={<BdoMovementHistoryPage />} />
                  <Route path="purchases" element={<BdoPurchasesPage />} />
                  <Route path="stock-count" element={<BdoStockCountPage />} />
                  <Route path="monthly-report" element={<BdoMonthlyReportPage />} />
                  <Route path="corrections" element={<BdoCorrectionsPage />} />
                  <Route path="settings" element={<BdoSettingsPage />} />
                </Route>
                <Route path="purchase-orders" element={<LegacyPurchaseOrdersRedirect />} />
                <Route path="purchasing" element={<PurchasingLayout />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<PurchasingDashboardPage />} />
                  <Route path="replenishment" element={<PurchasingReplenishmentPage />} />
                  <Route path="suppliers/analytics" element={<PurchasingSupplierAnalyticsPage />} />
                  <Route path="cooperation-history" element={<PurchasingCooperationHistoryPage />} />
                  <Route path="orders/:id" element={<PurchasingPoDetailPage />} />
                  <Route path="orders" element={<PurchasingPoPage />} />
                  <Route path="forecast" element={<PurchasingForecastPage />} />
                  <Route path="alerts" element={<PurchasingAlertsPage />} />
                  <Route path="segments" element={<PurchasingSegmentsPage />} />
                  <Route path="auto-reorder" element={<PurchasingAutoReorderPage />} />
                  <Route path="price-opportunities" element={<PurchasingPriceOpportunitiesPage />} />
                </Route>
                <Route path="assortment/import" element={<Navigate to="/settings/import" replace />} />
                <Route path="orders" element={<OrdersLayout />}>
                  <Route index element={<Navigate to="list" replace />} />
                  <Route path="new" element={<CreateOrderPage />} />
                  <Route path="list" element={<OrderList />} />
                  <Route path="custom-fields" element={<OrderCustomFieldsListPage />} />
                  <Route path="custom-fields/new" element={<OrderCustomFieldEditPage />} />
                  <Route path="custom-fields/:fieldId/edit" element={<OrderCustomFieldEditPage />} />
                  <Route path="import" element={<Navigate to="/settings/import?kind=orders" replace />} />
                  <Route path="returns" element={<ReturnsModuleLayout />}>
                    <Route index element={<ReturnsListPanel />} />
                    <Route path="panel-statuses" element={<ReturnPanelUiStatusesSettingsPage />} />
                    <Route path="workflow-statuses" element={<ReturnStatusesPage />} />
                    <Route path="statuses" element={<ReturnsModuleSettingsTabPage tab="statusy" />} />
                    <Route path="return-types" element={<ReturnsModuleSettingsTabPage tab="rodzaje" />} />
                    <Route path="sources" element={<ReturnsModuleSettingsTabPage tab="zrodla" />} />
                    <Route path="configurator" element={<ReturnsModuleSettingsTabPage tab="konfigurator" />} />
                    <Route path=":returnId" element={<ReturnsReturnDetailPage />} />
                  </Route>
                  <Route path="automation" element={<OrderAutomationModuleShell />}>
                    <Route index element={<Navigate to="orders" replace />} />
                    <Route path="logs" element={<OrderAutomationLogsPage />} />
                    <Route path="groups" element={<OrderAutomationGroupsPage />} />
                    <Route path="orders" element={<OrderAutomationListPage />} />
                    <Route path="orders/new" element={<OrderAutomationEditorPage />} />
                    <Route path="orders/:ruleId/edit" element={<OrderAutomationEditorPage />} />
                    <Route path="inventory" element={<OrderAutomationListPage />} />
                    <Route path="inventory/new" element={<OrderAutomationEditorPage />} />
                    <Route path="inventory/:ruleId/edit" element={<OrderAutomationEditorPage />} />
                    <Route path="assortment" element={<Navigate to="/orders/automation/inventory" replace />} />
                    <Route path="assortment/new" element={<Navigate to="/orders/automation/inventory/new" replace />} />
                    <Route path="assortment/:ruleId/edit" element={<RedirectAssortmentRuleEditToInventory />} />
                    <Route path="new" element={<Navigate to="/orders/automation/orders/new" replace />} />
                    <Route path=":ruleId/edit" element={<RedirectLegacyAutomationRuleEdit />} />
                  </Route>
                  <Route path="complaints/:id" element={<ComplaintDetailPage />} />
                  <Route
                    path=":id"
                    element={
                      <ErrorBoundary>
                        <OrderDetailPage />
                      </ErrorBoundary>
                    }
                  />
                </Route>
                <Route path="returns" element={<ReturnsHubPage />} />
                <Route path="carts" element={<CartsLayout />}>
                  <Route index element={<Navigate to="bulk" replace />} />
                  <Route path="carriers" element={<WarehouseCarriersPage />} />
                  <Route path="carriers/:id" element={<WarehouseCarrierDetailPage />} />
                  <Route path="bulk" element={<CartsBulk />} />
                  <Route path="baskets" element={<CartsBaskets />} />
                  <Route path="racks" element={<CartsRacks />} />
                  <Route path="zones" element={<CartsZones />} />
                </Route>
                <Route path="changelog" element={<Changelog />} />
                <Route path="carts/:id" element={<CartDetails />} />
                <Route path="optimizer" element={<FleetPlanner />} />
                <Route path="waves" element={<PickingWaves />} />
                <Route path="designer" element={<WarehouseDesigner />} />
                <Route path="warehouse-designer" element={<WarehouseDesigner />} />
                <Route path="office/damages" element={<OfficeDamagesPage />} />
                <Route path="office/damage-reports" element={<OfficeDamageReportsPage />} />
                <Route path="barcode-management" element={<BarcodeManagement />} />
                <Route path="inventory" element={<InventoryList />} />
                <Route path="analytics/warehouse-operations" element={<WarehouseOperationsPage />} />
                <Route path="analytics/live-warehouse" element={<Navigate to="/analytics/warehouse-operations" replace />} />
                <Route path="analytics" element={<AnalyticsLayout />}>
                  <Route index element={<Navigate to="/analytics/dashboard" replace />} />
                  <Route path="dashboard" element={<AnalyticsDashboardPage />} />
                  <Route path="inventory-value" element={<InventoryValue />} />
                  <Route path="dead-stock" element={<DeadStock />} />
                  <Route path="product-rotation" element={<ProductRotation />} />
                  <Route path="hot-products" element={<HotProducts />} />
                  <Route path="product-affinity" element={<ProductAffinity />} />
                  <Route path="walking-cost" element={<WalkingCost />} />
                  <Route path="hot-locations" element={<HotLocations />} />
                  <Route path="pick-density" element={<PickDensity />} />
                  <Route path="picking-analysis" element={<PickingAnalysis />} />
                  <Route path="sales-forecast" element={<SalesForecastAnalytics />} />
                  <Route path="batch-picking" element={<BatchPicking />} />
                  <Route path="pick-path-simulation" element={<PickPathSimulation />} />
                  <Route path="warehouse-day-simulation" element={<WarehouseDaySimulation />} />
                  <Route path="pick-time-simulation" element={<PickTimeSimulation />} />
                  <Route path="worker-flow-simulation" element={<WorkerFlowSimulation />} />
                  <Route path="slotting" element={<Slotting />} />
                  <Route path="picking-strategy" element={<PickingStrategy />} />
                  <Route path="layout-optimization" element={<LayoutOptimization />} />
                  <Route path="warehouse-throughput" element={<WarehouseThroughput />} />
                  <Route path="warehouse-map" element={<WarehouseMap />} />
                  <Route path="picking-issues-dead-stock" element={<PickingIssuesDeadStock />} />
                </Route>
                <Route path="analysis" element={<Navigate to="/analytics/dashboard" replace />} />
                <Route path="analiza" element={<Navigate to="/analytics/dashboard" replace />} />
                <Route path="analysis/dashboard" element={<Navigate to="/analytics/dashboard" replace />} />
                <Route path="analysis/inventory-value" element={<Navigate to="/analytics/inventory-value" replace />} />
                <Route path="analysis/dead-stock" element={<Navigate to="/analytics/dead-stock" replace />} />
                <Route path="analysis/product-rotation" element={<Navigate to="/analytics/product-rotation" replace />} />
                <Route path="analysis/hot-products" element={<Navigate to="/analytics/hot-products" replace />} />
                <Route path="analysis/product-pairs" element={<Navigate to="/analytics/product-affinity" replace />} />
                <Route path="analysis/walking-cost" element={<Navigate to="/analytics/walking-cost" replace />} />
                <Route path="analysis/pick-heatmap" element={<Navigate to="/analytics/hot-locations" replace />} />
                <Route path="analysis/pick-density" element={<Navigate to="/analytics/pick-density" replace />} />
                <Route path="analysis/warehouse-operations" element={<Navigate to="/analytics/warehouse-operations" replace />} />
                <Route path="analysis/live-warehouse" element={<Navigate to="/analytics/warehouse-operations" replace />} />
                <Route path="analiza/centrum-operacyjne" element={<Navigate to="/analytics/warehouse-operations" replace />} />
                <Route path="analysis/picking-analysis" element={<Navigate to="/analytics/picking-analysis" replace />} />
                <Route path="analysis/sales-forecast" element={<Navigate to="/analytics/sales-forecast" replace />} />
                <Route path="analysis/batch-picking" element={<Navigate to="/analytics/batch-picking" replace />} />
                <Route path="analysis/pick-path-simulation" element={<Navigate to="/analytics/pick-path-simulation" replace />} />
                <Route path="analysis/warehouse-day-simulation" element={<Navigate to="/analytics/warehouse-day-simulation" replace />} />
                <Route path="analysis/pick-time-simulation" element={<Navigate to="/analytics/pick-time-simulation" replace />} />
                <Route path="analysis/worker-flow-simulation" element={<Navigate to="/analytics/worker-flow-simulation" replace />} />
                <Route path="analysis/slotting" element={<Navigate to="/analytics/slotting" replace />} />
                <Route path="analysis/picking-strategy" element={<Navigate to="/analytics/picking-strategy" replace />} />
                <Route path="analysis/layout-optimization" element={<Navigate to="/analytics/layout-optimization" replace />} />
                <Route path="analysis/warehouse-throughput" element={<Navigate to="/analytics/warehouse-throughput" replace />} />
                <Route path="analysis/warehouse-map" element={<Navigate to="/analytics/warehouse-map" replace />} />
                <Route path="analysis/picking-issues-dead-stock" element={<Navigate to="/analytics/picking-issues-dead-stock" replace />} />
                <Route path="system" element={<SystemLayout />}>
                  <Route index element={<Navigate to="health" replace />} />
                  <Route path="health" element={<SystemHealth />} />
                  <Route path="db-size" element={<SystemDbSize />} />
                  <Route path="metrics" element={<SystemMetrics />} />
                  <Route path="errors" element={<SystemErrorLogs />} />
                  <Route path="changelog" element={<SystemChangelog />} />
                </Route>
                <Route path="labels/*" element={<LabelSystem />} />
                <Route path="system-etykiet/*" element={<LabelSystem />} />
                <Route path="planning/deliveries" element={<PlanningPlaceholder />} />
                <Route path="planning/list" element={<PlanningPlaceholder />} />
      </Route>
    </Route>
  ),
)