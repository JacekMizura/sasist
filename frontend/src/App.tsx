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
import { LabelProvider } from "./labels"
import { CartsRefreshProvider } from "./context/CartsRefreshContext"

import MainPanelLayout from "./layout/MainPanelLayout"
import SettingsAdminLayout from "./layout/SettingsAdminLayout"
import WmsOperationalLayout from "./layout/WmsOperationalLayout"
import ErrorBoundary from "./components/ErrorBoundary"
import ProtectedRoute from "./components/auth/ProtectedRoute"

import Dashboard from "./pages/Dashboard"
import PanelStatusSidebarMockupV3, {
  PanelStatusSidebarMockupV3Screenshot,
} from "./components/panel/mockups/PanelStatusSidebarMockupV3"
import PanelStatusV3ScreenshotsPage from "./components/panel/mockups/PanelStatusV3ScreenshotsPage"
import ModuleListOrdersVsReturnsScreenshotPage from "./components/listPage/moduleList/mockups/ModuleListOrdersVsReturnsScreenshotPage"
import ReturnsStatusesConfiguratorScreenshotPage from "./pages/Settings/returnsStatusesConfigurator/mockups/ReturnsStatusesConfiguratorScreenshotPage"
import WmsHomePreviewPage from "./pages/wms/launcher/mockups/WmsHomePreviewPage"
import DesignSystemPlaygroundPage from "./pages/design-system/DesignSystemPlaygroundPage"
import ProductsLayout from "./pages/Products/ProductsLayout"
import ProductList from "./pages/Products/ProductList"
import ProductNewPage from "./pages/Products/ProductNewPage"
import ProductEditPage from "./pages/Products/ProductEditPage"
import ProductDetailRedirect from "./pages/Products/ProductDetailRedirect"
import ProductProfitabilityPage from "./pages/Products/ProductProfitabilityPage"
import OrdersLayout from "./pages/Orders/OrdersLayout"
import OrderList from "./pages/Orders/OrderList"
import ReturnStatusesPage from "./pages/Orders/ReturnStatusesPage"
import ReturnsHubPage from "./pages/Orders/ReturnsHubPage"
import ReturnsListPanel from "./pages/Orders/ReturnsListPanel"
import ReturnsReturnDetailPage from "./pages/Orders/ReturnsReturnDetailPage"
import CreateOrderPage from "./pages/Orders/CreateOrderPage"
import OrderDetailPage from "./pages/Orders/OrderDetailPage"
import CustomerReturnFormPage from "./pages/Orders/CustomerReturnFormPage"
import OrderCustomFieldsListPage from "./pages/Orders/OrderCustomFieldsListPage"
import OrderCustomFieldEditPage from "./pages/Orders/OrderCustomFieldEditPage"
import OrderAutomationModuleShell from "./pages/Orders/OrderAutomationModuleShell"
import OrderAutomationListPage from "./pages/Orders/OrderAutomationListPage"
import OrderAutomationLogsPage from "./pages/Orders/OrderAutomationLogsPage"
import OrderAutomationEditorPage from "./pages/Orders/OrderAutomationEditorPage"
import OrderAutomationGroupsPage from "./pages/Orders/OrderAutomationGroupsPage"
import OrderAutomationSettingsPage from "./pages/Orders/OrderAutomationSettingsPage"
import {
  RedirectAssortmentRuleEditToInventory,
  RedirectLegacyAutomationRuleEdit,
} from "./pages/Orders/orderAutomationRouteRedirects"
import SettingsImportPage from "./pages/Settings/SettingsImportPage"
import CompanySettingsLayout from "./modules/companySettings/layout/CompanySettingsLayout"
import CompanyProfileTab from "./modules/companySettings/views/CompanyProfileTab"
import CompanyWarehousesTab from "./modules/companySettings/views/CompanyWarehousesTab"
import CompanyTenantsTab from "./modules/companySettings/views/CompanyTenantsTab"
import CompanyBrandingTab from "./modules/companySettings/views/CompanyBrandingTab"
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
import WorkforceStatusMatrixPage from "./pages/Settings/WorkforceStatusMatrixPage"
import WmsSettingsPage from "./pages/Settings/WmsSettingsPage"
import {
  WmsWorkstationDetailPage,
  WmsWorkstationsListPage,
} from "./pages/Settings/wmsWorkstations"
import ReturnsModuleLayout from "./pages/Orders/ReturnsModuleLayout"
import ReturnsModuleSettingsTabPage from "./pages/Orders/ReturnsModuleSettingsTabPage"
import ReturnPanelUiStatusesSettingsPage from "./pages/Settings/ReturnPanelUiStatusesSettingsPage"
import OrderPanelUiStatusesSettingsPage from "./pages/Settings/OrderPanelUiStatusesSettingsPage"
import ComplaintPanelUiStatusesSettingsPage from "./pages/Settings/ComplaintPanelUiStatusesSettingsPage"
import ShippingMethodsSettingsPage from "./pages/Settings/ShippingMethodsSettingsPage"
import OfferStockPoolsSettingsPage from "./pages/Settings/OfferStockPoolsSettingsPage"
import ApiKeysSettingsPage from "./pages/Settings/integrations/ApiKeysSettingsPage"
import IntegrationsSettingsPage from "./pages/Settings/integrations/IntegrationsSettingsPage"
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
import WarehouseDesigner from "./pages/WarehouseDesigner"
/** @deprecated DELETE_CANDIDATE — superseded by LabelSystem (/labels). Keep file until cleanup. */
import BarcodeManagement from "./pages/BarcodeManagement"
import LabelSystem from "./pages/LabelSystem"
import DocumentTemplatesLayout from "./pages/Settings/document-templates/DocumentTemplatesLayout";
import DocumentTemplatesModuleFrame from "./pages/Settings/document-templates/DocumentTemplatesModuleFrame";
import { DocumentTemplateCreatePage } from "./pages/Settings/document-templates/DocumentTemplateCreatePage";
import { DocumentTemplateEditorPage } from "./pages/Settings/document-templates/DocumentTemplateEditorPage";
import { DocumentTemplatesListPage } from "./pages/Settings/document-templates/DocumentTemplatesListPage";
import { StarterGalleryPage } from "./pages/Settings/document-templates/StarterGalleryPage";
import { StarterDetailPage } from "./pages/Settings/document-templates/StarterDetailPage";
import MessageTemplatesModule from "./pages/admin/MessageTemplatesModule"
import InventoryList from "./pages/InventoryList"
import SystemLayout from "./pages/System/SystemLayout"
import SystemHealth from "./pages/System/SystemHealth"
import SystemDbSize from "./pages/System/SystemDbSize"
import SystemMetrics from "./pages/System/SystemMetrics"
import SystemErrorLogs from "./pages/System/SystemErrorLogs"
import SystemChangelog from "./pages/System/SystemChangelog"
import SystemAppDictionaryPage from "./pages/System/SystemAppDictionaryPage"
import AnalyticsLayout from "./pages/analytics/AnalyticsLayout"
import AnalizyModuleLayout from "./pages/analizy/AnalizyModuleLayout"
import InventoryValue from "./pages/analytics/InventoryValue"
import DeadStock from "./pages/analytics/DeadStock"
import HotProducts from "./pages/analytics/HotProducts"
import ProductAffinity from "./pages/analytics/ProductAffinity"
import HotLocations from "./pages/analytics/HotLocations"
import PickingAnalysis from "./pages/analytics/PickingAnalysis"
import SalesForecastAnalytics from "./pages/analytics/SalesForecast"
import PickPathSimulation from "./pages/analytics/PickPathSimulation"
import Slotting from "./pages/analytics/Slotting"
import PickingStrategy from "./pages/analytics/PickingStrategy"
import WarehouseMap from "./pages/analytics/WarehouseMap"
import BundleIntelligence from "./pages/analytics/BundleIntelligence"
import OptymalizacjaLayout from "./pages/optymalizacja/OptymalizacjaLayout"
import OptymalizacjaLandingPage from "./pages/optymalizacja/OptymalizacjaLandingPage"
import PlanZmianPage from "./pages/optymalizacja/PlanZmianPage"
import HistoriaZmianPage from "./pages/optymalizacja/HistoriaZmianPage"
import RankingZmianPage from "./pages/optymalizacja/RankingZmianPage"
import WarehouseStructureReportPage from "./reports/WarehouseStructureReportPage"
import ProductLocationReportPage from "./reports/ProductLocationReportPage"
import WmsPickingPage from "./pages/wms/WmsPickingPage"
import WmsPickingProductDetailPage from "./pages/wms/WmsPickingProductDetailPage"
import WmsPickingProductsPage from "./pages/wms/WmsPickingProductsPage"
import WmsBundleBulkScanPage from "./pages/wms/WmsBundleBulkScanPage"
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
import WmsPackingWorkstationGate from "./pages/wms/WmsPackingWorkstationGate"
import WmsDirectSalesPage from "./pages/wms/WmsDirectSalesPage"
import DirectSalesSettingsLayout from "./pages/wms/direct-sales/DirectSalesSettingsLayout"
import PulpitKierownikaPage from "./pages/zarzadzanie/PulpitKierownikaPage"
import KolejnoscDostawPage from "./pages/zarzadzanie/KolejnoscDostawPage"
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
import ConsolidationQueuePage from "./pages/wms/consolidation/ConsolidationQueuePage"
import ConsolidationRacksDashboardPage from "./pages/wms/consolidation/ConsolidationRacksDashboardPage"
import ConsolidationRacksControlTowerPage from "./pages/wms/consolidation/ConsolidationRacksControlTowerPage"
import ConsolidationStagingPage from "./pages/wms/consolidation/ConsolidationStagingPage"
import ConsolidationControlTowerPage from "./pages/wms/consolidation/ConsolidationControlTowerPage"
import ConsolidationDetailPage from "./pages/wms/consolidation/ConsolidationDetailPage"
import { WMS_ROUTES } from "./pages/wms/wmsRoutes"
import WarehouseCarriersPage from "./pages/warehouse/WarehouseCarriersPage"
import WarehouseCarrierDetailPage from "./pages/warehouse/WarehouseCarrierDetailPage"
import WmsPhoneUploadPage from "./pages/wms/WmsPhoneUploadPage"
import WmsComplaintDetailPage from "./pages/wms/WmsComplaintDetailPage"
import WmsReturnsPage from "./pages/damage/WmsReturnsPage"
import WmsReturnsEntryPage from "./pages/wms/WmsReturnsEntryPage"
import { WmsReturnsOrderLegacyRedirect } from "./pages/wms/wmsReturnsLegacyRedirects"
import OfficeDamagesPage from "./pages/damage/OfficeDamagesPage"
import OfficeDamageReportsPage from "./pages/damage/OfficeDamageReportsPage"
import BundlesPage from "./pages/Assortment/BundlesPage"
import BundleNewPage from "./pages/Assortment/BundleNewPage"
import BundleEditPage from "./pages/Assortment/BundleEditPage"
import ProductionErpModuleLayout from "./pages/Production/ProductionErpModuleLayout"
import WmsProductionExecutionLayout from "./pages/Production/WmsProductionExecutionLayout"
import ProductionDashboardPage from "./pages/Production/ProductionDashboardPage"
import RecipesListPage from "./pages/Production/RecipesListPage"
import RecipeDetailPage from "./pages/Production/RecipeDetailPage"
import BatchesListPage from "./pages/Production/BatchesListPage"
import BatchDetailPage from "./pages/Production/BatchDetailPage"
import MaterialReservationsPage from "./pages/Production/MaterialReservationsPage"
import ProductionShortagesPage from "./pages/Production/ProductionShortagesPage"
import MaterialAnalysisPage from "./pages/Production/MaterialAnalysisPage"
import PaperProductionPage from "./pages/Production/PaperProductionPage"
import ProductionOrdersPage from "./pages/Production/ProductionOrdersPage"
import CreateProductionOrderPage from "./pages/Production/CreateProductionOrderPage"
import ProductionOrderDetailPage from "./pages/Production/ProductionOrderDetailPage"
import ProductionPlanningPage from "./pages/Production/ProductionPlanningPage"
import ProductionHistoryPage from "./pages/Production/ProductionHistoryPage"
import ProductionAnalyticsPage from "./pages/Production/ProductionAnalyticsPage"
import CollectingPage from "./pages/Production/CollectingPage"
import ProductionExecutionPage from "./pages/Production/ProductionExecutionPage"
import PutawayPage from "./pages/Production/PutawayPage"
import ManufacturersPage from "./pages/Assortment/ManufacturersPage"
import ManufacturerEditPage from "./pages/Assortment/ManufacturerEditPage"
import SuppliersPage from "./pages/Assortment/SuppliersPage"
import SupplierEditPage from "./pages/Assortment/SupplierEditPage"
import SuppliersLayout from "./pages/Assortment/SuppliersLayout"
import PurchasingLayout from "./pages/purchasing/PurchasingLayout"
import PurchasingPoDetailPage from "./pages/purchasing/PurchasingPoDetailPage"
import { PurchasingRedirectTo } from "./pages/purchasing/purchasingRedirects"
import { PurchasingTabSuspense } from "./modules/purchasing/views/PurchasingTabSuspense"
import PurchasingSuppliersTabLayout from "./modules/purchasing/layout/PurchasingSuppliersTabLayout"
import {
  PlanningDashboard,
  PurchasePlanView,
  PurchaseOrdersView,
  SavingsView,
  SupplierHistoryView,
  SupplierScoreView,
} from "./modules/purchasing/views/lazyViews"
import InventoryCountErpLayout from "./pages/inventory-count/InventoryCountErpLayout"
import InventoryCountDashboardPage from "./pages/inventory-count/InventoryCountDashboardPage"
import InventoryCountDocumentsPage from "./pages/inventory-count/InventoryCountDocumentsPage"
import InventoryCountWizardPage from "./pages/inventory-count/InventoryCountWizardPage"
import InventoryCountReportsPage from "./pages/inventory-count/InventoryCountReportsPage"
import InventoryCountDocumentDetailPage from "./pages/inventory-count/InventoryCountDocumentDetailPage"
import ErpPanelRouteErrorPage from "./pages/errors/ErpPanelRouteErrorPage"
import RouteNotFoundThrow from "./pages/errors/RouteNotFoundThrow"
import WmsInventoryCountLayout from "./pages/wms/inventory-count/WmsInventoryCountLayout"
import WmsInventoryCountLandingPage from "./pages/wms/inventory-count/WmsInventoryCountLandingPage"
import WmsInventoryCountEntryPage from "./pages/wms/inventory-count/WmsInventoryCountEntryPage"
import WmsInventoryCountTerminalPage from "./pages/wms/inventory-count/WmsInventoryCountTerminalPage"
import WmsInventoryCountTaskRedirect from "./pages/wms/inventory-count/WmsInventoryCountTaskRedirect"
import CustomersListPage from "./pages/customers/CustomersListPage"
import CustomerEditPage from "./pages/customers/CustomerEditPage"
import CustomerPurchaseHistoryPage from "./pages/customers/CustomerPurchaseHistoryPage"
import CustomerActivityPage from "./pages/customers/CustomerActivityPage"
import CustomerNotesPage from "./pages/customers/CustomerNotesPage"
import CustomerDocumentsPage from "./pages/customers/CustomerDocumentsPage"
import PurchaseOrdersPage from "./pages/Assortment/PurchaseOrdersPage"
import PurchaseOrderEditPage from "./pages/Assortment/PurchaseOrderEditPage"
import PurchaseOrderNewPage from "./pages/Assortment/PurchaseOrderNewPage"
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
import DocumentsSalesDetailPage from "./pages/documents/DocumentsSalesDetailPage"
import DocumentsCorrectingPage from "./pages/documents/DocumentsCorrectingPage"
import DocumentsWarehousePage from "./pages/documents/DocumentsWarehousePage"
import DocumentsWarehouseDetailPage from "./pages/documents/DocumentsWarehouseDetailPage"
import DocumentsExportsHubPage from "./pages/documents/DocumentsExportsHubPage"

function RedirectLegacySettingsDocumentSeriesId() {
  const { legacyId } = useParams<{ legacyId: string }>()
  const to = legacyId ? `/documents/series/${encodeURIComponent(legacyId)}` : "/documents/series"
  return <Navigate to={to} replace />
}

function RedirectPolishSaleDocumentDetail() {
  const { documentId } = useParams<{ documentId: string }>()
  const to = documentId
    ? `/documents/sales/${encodeURIComponent(documentId)}`
    : "/documents/sales/invoices"
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

/** Legacy WMS batch URL → canonical collecting/batch/:id. */
function WmsProductionBatchRedirect() {
  const { batchId } = useParams();
  return <Navigate to={`/wms/production/collecting/batch/${batchId ?? ""}`} replace />;
}

type WmsProductionPhase = "collecting" | "execute" | "putaway";

/** Legacy /wms/production/:phase/:batchId → /wms/production/:phase/batch/:batchId */
function WmsProductionLegacyPhaseRedirect({ phase }: { phase: WmsProductionPhase }) {
  const { batchId } = useParams();
  return <Navigate to={`/wms/production/${phase}/batch/${batchId ?? ""}`} replace />;
}

/** Legacy /production/paper/:kind/:id → /production/erp/:kind/:id */
function ProductionPaperLegacyRedirect() {
  const { kind, id } = useParams();
  return <Navigate to={`/production/erp/${kind ?? "batch"}/${id ?? ""}`} replace />;
}

/** Legacy production putaway tab → standard WMS Rozlokowanie. */
function WmsProductionPutawayRedirect() {
  return <Navigate to="/wms/putaway" replace />;
}

function AppRootLayout() {
  return (
    <AuthProvider>
      <LabelProvider>
        <WarehouseProvider>
          <CartsRefreshProvider>
            <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
            <PasswordChangeGate />
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </CartsRefreshProvider>
        </WarehouseProvider>
      </LabelProvider>
    </AuthProvider>
  )
}

const LEGACY_RETURNS_SETTINGS_SEGMENTS: Record<string, string> = {
  "": "/orders/returns",
  "ui-statuses": "/orders/returns/panel-statuses",
  statusy: "/orders/returns/statuses",
  "rodzaje-zwrotow": "/orders/returns/dictionaries",
  zrodla: "/orders/returns/dictionaries",
  slowniki: "/orders/returns/dictionaries",
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

/** Legacy `/administration/templates/messages/*` → `/templates/messages/*`. */
function LegacyAdministrationMessageTemplatesRedirect() {
  const loc = useLocation()
  const tail = loc.pathname.replace(/^\/administration\/templates\/messages\/?/, "")
  const to = tail ? `/templates/messages/${tail}` : "/templates/messages"
  return <Navigate to={`${to}${loc.search}`} replace />
}

/** Legacy `/administration/templates/prints/*` → `/templates/labels/*`. */
function LegacyAdministrationPrintTemplatesRedirect() {
  const loc = useLocation()
  const tail = loc.pathname.replace(/^\/administration\/templates\/prints\/?/, "")
  const to = tail ? `/templates/labels/${tail}` : "/templates/labels"
  return <Navigate to={`${to}${loc.search}`} replace />
}

/** Alias `/admin/print-templates/*` → `/templates/labels/*`. */
function RedirectAdminPrintTemplatesToLabels() {
  const loc = useLocation()
  const tail = loc.pathname.replace(/^\/admin\/print-templates\/?/, "")
  const to = tail ? `/templates/labels/${tail}` : "/templates/labels"
  return <Navigate to={`${to}${loc.search}`} replace />
}

/** Alias `/system-etykiet/*` → `/templates/labels/*`. */
function RedirectSystemEtykietToLabels() {
  const loc = useLocation()
  const tail = loc.pathname.replace(/^\/system-etykiet\/?/, "")
  const to = tail ? `/templates/labels/${tail}` : "/templates/labels"
  return <Navigate to={`${to}${loc.search}`} replace />
}

/** Alias `/labels/*` → `/templates/labels/*`. */
function RedirectLabelsToTemplatesLabels() {
  const loc = useLocation()
  const tail = loc.pathname.replace(/^\/labels\/?/, "")
  const to = tail ? `/templates/labels/${tail}` : "/templates/labels"
  return <Navigate to={`${to}${loc.search}`} replace />
}

/** Alias `/settings/document-templates/*` → `/templates/print/*`. */
function RedirectDocumentTemplatesToPrint() {
  const loc = useLocation()
  const tail = loc.pathname.replace(/^\/settings\/document-templates\/?/, "")
  const to = tail ? `/templates/print/${tail}` : "/templates/print"
  return <Navigate to={`${to}${loc.search}`} replace />
}

/** Alias `/admin/message-templates/*` → `/templates/messages/*`. */
function RedirectMessageTemplatesToMessages() {
  const loc = useLocation()
  const tail = loc.pathname.replace(/^\/admin\/message-templates\/?/, "")
  const to = tail ? `/templates/messages/${tail}` : "/templates/messages"
  return <Navigate to={`${to}${loc.search}`} replace />
}

/** Alias `/settings/exports/*` → `/templates/exports/*`. */
function RedirectExportsToTemplatesExports() {
  const loc = useLocation()
  const tail = loc.pathname.replace(/^\/settings\/exports\/?/, "")
  const to = tail ? `/templates/exports/${tail}` : "/templates/exports"
  return <Navigate to={`${to}${loc.search}`} replace />
}

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<AppRootLayout />}>
      <Route path="login" element={<LoginPage />} />
      <Route path="dev/panel-status-sidebar-mockup-screenshot" element={<PanelStatusSidebarMockupV3Screenshot />} />
      <Route path="dev/panel-status-v3-screenshots" element={<PanelStatusV3ScreenshotsPage />} />
      <Route path="dev/module-list-orders-vs-returns" element={<ModuleListOrdersVsReturnsScreenshotPage />} />
      <Route path="dev/returns-statuses-configurator-screenshots" element={<ReturnsStatusesConfiguratorScreenshotPage />} />
      <Route path="dev/wms-home-preview" element={<WmsHomePreviewPage />} />
      <Route path="design-system" element={<DesignSystemPlaygroundPage />} />
      <Route path="wms-upload/:sessionId" element={<WmsPhoneUploadPage />} />
      <Route element={<ProtectedRoute />}>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="report/warehouse-structure" element={<WarehouseStructureReportPage />} />
      <Route path="report/product-locations" element={<ProductLocationReportPage />} />
      <Route path="wms" element={<WmsOperationalLayout />}>
        <Route index element={<Navigate to="menu" replace />} />
        <Route path="menu" element={<WmsMenuPage />} />
        <Route path="returns" element={<WmsReturnsEntryPage />} />
        <Route path="returns/order/:orderId" element={<WmsReturnsOrderLegacyRedirect />} />
        <Route path="returns/create/:orderId" element={<WmsReturnsOrderLegacyRedirect />} />
        <Route path="returns/process/:returnId" element={<WmsReturnsPage />} />
        <Route path="returns/complaints/:complaintId" element={<WmsComplaintDetailPage />} />
        {/* Kanoniczny URL zgodny z segmentem API ``/wms/receiving/pz/...``; starszy ``/wms/receiving/:id`` zostaje dla zakładek. */}
        <Route path="receiving/pz/:pzId" element={<WmsReceivingCountPage />} />
        <Route path="receiving/:pzId" element={<WmsReceivingCountPage />} />
        <Route path="receiving/incomplete-product-data" element={<WmsIncompleteProductDataPage />} />
        <Route path="product-data-completion" element={<WmsProductDataCompletionPage />} />
        <Route path="receiving" element={<WmsReceivingPage />} />
        <Route path="supply-flow" element={<Navigate to="/zarzadzanie-magazynem/kolejnosc-dostaw" replace />} />
        <Route path="putaway" element={<WmsPutawayPage />} />
        <Route path="putaway/:pzId/item/:itemId/execute" element={<WmsPutawayExecutePage />} />
        <Route path="putaway/:pzId/item/:itemId" element={<WmsPutawayItemDetailPage />} />
        <Route path="putaway/:pzId" element={<WmsPutawayPzPage />} />
        <Route path="mm/relocation/:pzId/item/:itemId/execute" element={<WmsPutawayExecutePage />} />
        <Route path="mm/relocation/:pzId/item/:itemId" element={<WmsPutawayItemDetailPage />} />
        <Route path="mm/relocation/:pzId" element={<WmsPutawayPzPage />} />
        <Route path="mm" element={<WmsMmTransferPage />} />
        <Route path="consolidation-racks/control-tower" element={<ConsolidationRacksControlTowerPage />} />
        <Route path="consolidation-racks" element={<ConsolidationRacksDashboardPage />} />
        <Route path="consolidations/staging" element={<ConsolidationStagingPage />} />
        <Route path="consolidations/control-tower" element={<ConsolidationControlTowerPage />} />
        <Route path="consolidations" element={<ConsolidationQueuePage />} />
        <Route path="consolidations/:planId" element={<ConsolidationDetailPage />} />
        <Route path="replenishment/*" element={<Navigate to="/wms/mm" replace />} />
        {/* Nośniki nie są modułem WMS — legacy URL → przyjęcia (tworzenie / przypisanie tylko z PZ). */}
        <Route path="carriers/*" element={<Navigate to={WMS_ROUTES.receiving} replace />} />
        <Route path="picking" element={<Outlet />}>
          <Route index element={<WmsPickingStatusPage />} />
          <Route path="order-type" element={<WmsPickingOrderTypePage />} />
          <Route path="cart" element={<WmsPickingCartScanPage />} />
          <Route path="products/:productId" element={<WmsPickingProductDetailPage />} />
          <Route path="products" element={<WmsPickingProductsPage />} />
          <Route path="bundle-bulk-scan" element={<WmsBundleBulkScanPage />} />
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
        <Route path="operations/*" element={<Navigate to="/zarzadzanie-magazynem/pulpit" replace />} />
        <Route
          path="direct-sales"
          element={
            <ErrorBoundary>
              <DirectSalesSettingsLayout />
            </ErrorBoundary>
          }
        >
          <Route index element={<WmsDirectSalesPage />} />
        </Route>
        <Route path="packing" element={<WmsPackingWorkstationGate />}>
          <Route index element={<WmsPackingStatusPage />} />
          <Route path="mode" element={<WmsPackingModePage />} />
          <Route path="scan-cart" element={<WmsPackingScanCartPage />} />
          <Route path="orders" element={<WmsPackingOrdersPage />} />
          <Route path="order/:orderId" element={<WmsPackingOrderPage />} />
        </Route>
        <Route
          path="production"
          element={
            <ErrorBoundary>
              <WmsProductionExecutionLayout />
            </ErrorBoundary>
          }
        >
          <Route index element={<Navigate to="collecting" replace />} />
          <Route path="collecting/:kind/:id" element={<CollectingPage />} />
          <Route path="collecting/:batchId" element={<WmsProductionLegacyPhaseRedirect phase="collecting" />} />
          <Route path="collecting" element={<CollectingPage />} />
          <Route path="execute/:kind/:id" element={<ProductionExecutionPage />} />
          <Route path="execute/:batchId" element={<WmsProductionLegacyPhaseRedirect phase="execute" />} />
          <Route path="execute" element={<ProductionExecutionPage />} />
          <Route path="putaway/:kind/:id" element={<PutawayPage />} />
          <Route path="putaway/:batchId" element={<WmsProductionLegacyPhaseRedirect phase="putaway" />} />
          <Route path="putaway" element={<PutawayPage />} />
          <Route path="batch/:batchId" element={<WmsProductionBatchRedirect />} />
        </Route>
        <Route
          path="inventory-count"
          element={
            <ErrorBoundary>
              <WmsInventoryCountLayout />
            </ErrorBoundary>
          }
        >
          <Route index element={<WmsInventoryCountLandingPage />} />
          <Route path="d/:documentId" element={<WmsInventoryCountEntryPage />} />
          <Route path="d/:documentId/count/:taskId" element={<WmsInventoryCountTerminalPage />} />
          <Route path="count/:taskId" element={<WmsInventoryCountTaskRedirect />} />
          <Route path="tasks" element={<Navigate to="/wms/inventory-count" replace />} />
        </Route>
      </Route>
      <Route element={<SettingsAdminLayout />}>
                <Route path="setup" element={<Navigate to="/settings/company" replace />} />
                <Route path="settings/administrators" element={<AdministratorsLayout />}>
                  <Route element={<AdministratorsModuleFrame />}>
                    <Route index element={<AdministratorsPage />} />
                    <Route path="audit" element={<AdministratorsAuditPage />} />
                    <Route path="roles" element={<WorkforceStatusMatrixPage />} />
                    <Route path="groups" element={<WorkforceUserGroupsPage />} />
                    <Route path="costs" element={<EmployeeCostsOverviewPage />} />
                    <Route path="workforce" element={<WorkforceLayout />}>
                      <Route index element={<WorkforceDashboardPage />} />
                      <Route path="activity" element={<WorkforceActivityPage />} />
                      <Route path="status-matrix" element={<Navigate to="/settings/administrators/roles" replace />} />
                    </Route>
                  </Route>
                  {/* Static segments above must win over ``:id`` — in RR7 wzorzec ``:id(\\d+)`` nie dopasowuje się; walidacja liczbowego id w {@link AdministratorEditPage}. */}
                  <Route path="new" element={<AdministratorCreatePage />} />
                  <Route path=":id/edytuj" element={<AdministratorCreatePage />} />
                  <Route path=":id" element={<AdministratorCreatePage />} />
                </Route>
                <Route path="setup/printers/*" element={<Navigate to="/settings/wms/workstations" replace />} />
                <Route path="settings/devices/*" element={<Navigate to="/settings/wms/workstations" replace />} />
                <Route path="settings/printers/*" element={<Navigate to="/settings/wms/workstations" replace />} />
                <Route path="settings/wms/returns/*" element={<LegacySettingsWmsReturnsRedirect />} />
                <Route path="settings/wms/workstations/:id" element={<WmsWorkstationDetailPage />} />
                <Route path="settings/wms/workstations" element={<WmsWorkstationsListPage />} />
                <Route path="settings/wms" element={<WmsSettingsPage />} />
                <Route path="settings/returns/*" element={<LegacySettingsReturnsRedirect />} />
                <Route path="settings/returns" element={<LegacySettingsReturnsRedirect />} />
                <Route path="settings/orders/ui-statuses" element={<OrderPanelUiStatusesSettingsPage />} />
                <Route path="settings/complaints/ui-statuses" element={<ComplaintPanelUiStatusesSettingsPage />} />
                <Route path="settings/shipping-methods" element={<ShippingMethodsSettingsPage />} />
                <Route path="settings/sales/stock-pools" element={<OfferStockPoolsSettingsPage />} />
                <Route path="settings/integrations" element={<IntegrationsSettingsPage />} />
                <Route path="settings/api-keys" element={<ApiKeysSettingsPage />} />
                <Route
                  path="settings/integrations/api-keys"
                  element={<Navigate to="/settings/api-keys" replace />}
                />
                <Route path="settings/exports/*" element={<RedirectExportsToTemplatesExports />} />
                <Route path="settings/import" element={<SettingsImportPage />} />
                <Route path="settings" element={<Navigate to="/settings/company" replace />} />
                <Route path="settings/company" element={<CompanySettingsLayout />}>
                  <Route index element={<CompanyProfileTab />} />
                  <Route path="warehouses" element={<CompanyWarehousesTab />} />
                  <Route path="tenants" element={<CompanyTenantsTab />} />
                  <Route path="branding" element={<CompanyBrandingTab />} />
                </Route>
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
                <Route path="admin/message-templates/*" element={<RedirectMessageTemplatesToMessages />} />
                <Route path="admin/print-templates/*" element={<RedirectAdminPrintTemplatesToLabels />} />
                <Route path="settings/document-templates/*" element={<RedirectDocumentTemplatesToPrint />} />
                <Route path="document-templates/*" element={<Navigate to="/templates/print" replace />} />
                <Route path="dokumenty/sprzedaz/:documentId" element={<RedirectPolishSaleDocumentDetail />} />
                <Route path="documents" element={<DocumentsLayout />}>
                  <Route index element={<Navigate to="sales/invoices" replace />} />
                  <Route path="sales" element={<Outlet />}>
                    <Route index element={<Navigate to="invoices" replace />} />
                    <Route path="invoices" element={<DocumentsSalesPage />} />
                    <Route path="receipts" element={<DocumentsSalesPage />} />
                    <Route path=":documentId" element={<DocumentsSalesDetailPage />} />
                  </Route>
                  <Route path="correcting" element={<DocumentsCorrectingPage />} />
                  <Route path="corrections" element={<Navigate to="/documents/correcting" replace />} />
                  <Route path="returns" element={<Navigate to="/documents/correcting" replace />} />
                  <Route path="warehouse" element={<Outlet />}>
                    <Route index element={<Navigate to="pz" replace />} />
                    <Route path=":docSegment" element={<Outlet />}>
                      <Route index element={<DocumentsWarehousePage />} />
                      <Route path=":documentId" element={<DocumentsWarehouseDetailPage />} />
                    </Route>
                  </Route>
                  <Route path="exports" element={<DocumentsExportsHubPage />} />
                  <Route path="series" element={<DocumentSeriesListPage />} />
                  <Route path="series/new" element={<DocumentSeriesEditPage />} />
                  <Route path="series/:id" element={<DocumentSeriesEditPage />} />
                  <Route path="templates" element={<Navigate to="/templates/messages" replace />} />
                  <Route path="custom-fields" element={<Navigate to="/orders/custom-fields" replace />} />
                  <Route path="field-templates" element={<Navigate to="/orders/custom-fields" replace />} />
                  {/* Future: KSeF accounts UI — stub hidden until MF integration exists. */}
                  <Route path="ksef" element={<Navigate to="/documents/series" replace />} />
                </Route>
                <Route path="import" element={<Navigate to="/settings/import" replace />} />
                <Route path="import/history" element={<Navigate to="/settings/import?panel=history" replace />} />
      </Route>
      <Route element={<MainPanelLayout />} errorElement={<ErpPanelRouteErrorPage />}>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="dev/panel-status-sidebar-mockup" element={<PanelStatusSidebarMockupV3 />} />
                <Route path="complaints" element={<ComplaintsLayout />}>
                  <Route index element={<ComplaintsPanelPage />} />
                  <Route path=":id" element={<ComplaintDetailPage />} />
                </Route>
                <Route path="customers" element={<CustomersListPage />} />
                <Route path="customers/new" element={<CustomerEditPage />} />
                <Route path="customers/:id/historia-zakupow" element={<CustomerPurchaseHistoryPage />} />
                <Route path="customers/:id/aktywnosc" element={<CustomerActivityPage />} />
                <Route path="customers/:id/notatki" element={<CustomerNotesPage />} />
                <Route path="customers/:id/dokumenty" element={<CustomerDocumentsPage />} />
                <Route path="customers/:id" element={<CustomerEditPage />} />
                <Route path="bundles" element={<BundlesPage />} />
                <Route path="bundles/new" element={<BundleNewPage />} />
                <Route path="bundles/:id/edit" element={<BundleEditPage />} />
                <Route
                  path="production"
                  element={
                    <ErrorBoundary>
                      <ProductionErpModuleLayout />
                    </ErrorBoundary>
                  }
                >
                  <Route index element={<ProductionDashboardPage />} />
                  <Route path="recipes" element={<RecipesListPage />} />
                  <Route path="recipes/:compositionId" element={<RecipeDetailPage />} />
                  <Route path="orders" element={<ProductionOrdersPage />} />
                  <Route path="orders/new" element={<CreateProductionOrderPage />} />
                  <Route path="orders/:orderId" element={<ProductionOrderDetailPage />} />
                  <Route path="planning" element={<ProductionPlanningPage />} />
                  <Route path="history" element={<ProductionHistoryPage />} />
                  <Route path="analytics" element={<ProductionAnalyticsPage />} />
                  <Route path="material-reservations" element={<MaterialReservationsPage />} />
                  <Route path="shortages" element={<ProductionShortagesPage />} />
                  <Route path="material-analysis" element={<MaterialAnalysisPage />} />
                  <Route path="batches" element={<Navigate to="/production/planning" replace />} />
                  <Route path="batch/:batchId" element={<BatchDetailPage />} />
                  <Route path="erp/:kind/:id" element={<PaperProductionPage />} />
                  <Route path="paper/:kind/:id" element={<ProductionPaperLegacyRedirect />} />
                </Route>
                <Route
                  path="inventory-count"
                  element={
                    <ErrorBoundary>
                      <InventoryCountErpLayout />
                    </ErrorBoundary>
                  }
                  errorElement={<ErpPanelRouteErrorPage />}
                >
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<InventoryCountDashboardPage />} />
                  <Route path="documents" element={<InventoryCountDocumentsPage />} />
                  <Route path="documents/:documentId" element={<InventoryCountDocumentDetailPage />} />
                  <Route path="wizard" element={<InventoryCountWizardPage />} />
                  <Route path="wizard/:documentId" element={<InventoryCountWizardPage />} />
                  <Route path="reports" element={<InventoryCountReportsPage />} />
                </Route>
                <Route path="manufacturers" element={<ManufacturersPage />} />
                <Route path="manufacturers/new" element={<ManufacturerEditPage />} />
                <Route path="manufacturers/:manufacturerId/:tab" element={<ManufacturerEditPage />} />
                <Route path="manufacturers/:manufacturerId" element={<ManufacturerEditPage />} />
                <Route path="suppliers" element={<SuppliersLayout />}>
                  <Route index element={<SuppliersPage />} />
                  <Route path="ocena" element={<PurchasingRedirectTo to="/purchasing/suppliers/ocena" />} />
                  <Route path="historia" element={<PurchasingRedirectTo to="/purchasing/suppliers/historia" />} />
                </Route>
                <Route path="suppliers/new" element={<SupplierEditPage />} />
                <Route path="suppliers/:supplierId/:tab" element={<SupplierEditPage />} />
                <Route path="suppliers/:supplierId" element={<SupplierEditPage />} />
                <Route path="goods-orders/new" element={<PurchaseOrderNewPage />} />
                <Route path="goods-orders/:orderId/:tab" element={<PurchaseOrderEditPage />} />
                <Route path="goods-orders/:orderId" element={<PurchaseOrderEditPage />} />
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
                  <Route path=":id" element={<ProductDetailRedirect />} />
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
                  <Route
                    path="dashboard"
                    element={
                      <PurchasingTabSuspense>
                        <PlanningDashboard />
                      </PurchasingTabSuspense>
                    }
                  />
                  <Route
                    path="plan"
                    element={
                      <PurchasingTabSuspense>
                        <PurchasePlanView />
                      </PurchasingTabSuspense>
                    }
                  />
                  <Route path="replenishment" element={<PurchasingRedirectTo to="/purchasing/plan" />} />
                  <Route path="forecast" element={<PurchasingRedirectTo to="/purchasing/plan" />} />
                  <Route path="alerts" element={<PurchasingRedirectTo to="/purchasing/plan" />} />
                  <Route path="auto-reorder" element={<PurchasingRedirectTo to="/purchasing/plan" />} />
                  <Route path="suppliers" element={<PurchasingSuppliersTabLayout />}>
                    <Route index element={<Navigate to="ocena" replace />} />
                    <Route
                      path="ocena"
                      element={
                        <PurchasingTabSuspense>
                          <SupplierScoreView />
                        </PurchasingTabSuspense>
                      }
                    />
                    <Route
                      path="historia"
                      element={
                        <PurchasingTabSuspense>
                          <SupplierHistoryView />
                        </PurchasingTabSuspense>
                      }
                    />
                    <Route
                      path="oszczednosci"
                      element={
                        <PurchasingTabSuspense>
                          <SavingsView />
                        </PurchasingTabSuspense>
                      }
                    />
                  </Route>
                  <Route path="suppliers/analytics" element={<PurchasingRedirectTo to="/purchasing/suppliers/ocena" />} />
                  <Route path="cooperation-history" element={<PurchasingRedirectTo to="/purchasing/suppliers/historia" />} />
                  <Route path="price-opportunities" element={<PurchasingRedirectTo to="/purchasing/suppliers/oszczednosci" />} />
                  <Route path="orders/:id" element={<PurchasingPoDetailPage />} />
                  <Route
                    path="orders"
                    element={
                      <PurchasingTabSuspense>
                        <PurchaseOrdersView />
                      </PurchasingTabSuspense>
                    }
                  />
                </Route>
                <Route path="assortment/import" element={<Navigate to="/settings/import" replace />} />
                <Route path="orders" element={<OrdersLayout />}>
                  <Route index element={<Navigate to="list" replace />} />
                  <Route path="new" element={<CreateOrderPage />} />
                  <Route path="list" element={<OrderList />} />
                  <Route path=":id/customer-return-form" element={<CustomerReturnFormPage />} />
                  <Route path="custom-fields" element={<OrderCustomFieldsListPage />} />
                  <Route path="custom-fields/new" element={<OrderCustomFieldEditPage />} />
                  <Route path="custom-fields/:fieldId/edit" element={<OrderCustomFieldEditPage />} />
                  <Route path="import" element={<Navigate to="/settings/import?kind=orders" replace />} />
                  <Route path="returns" element={<ReturnsModuleLayout />}>
                    <Route index element={<ReturnsListPanel />} />
                    <Route path="panel-statuses" element={<ReturnPanelUiStatusesSettingsPage />} />
                    <Route path="workflow-statuses" element={<ReturnStatusesPage />} />
                    <Route path="statuses" element={<ReturnsModuleSettingsTabPage tab="statusy" />} />
                    <Route path="dictionaries" element={<ReturnsModuleSettingsTabPage tab="slowniki" />} />
                    <Route path="return-types" element={<Navigate to="/orders/returns/dictionaries" replace />} />
                    <Route path="sources" element={<Navigate to="/orders/returns/dictionaries" replace />} />
                    <Route path="configurator" element={<ReturnsModuleSettingsTabPage tab="konfigurator" />} />
                    <Route path=":returnId" element={<ReturnsReturnDetailPage />} />
                  </Route>
                  <Route path="automation" element={<OrderAutomationModuleShell />}>
                    <Route index element={<Navigate to="orders" replace />} />
                    <Route path="logs" element={<OrderAutomationLogsPage />} />
                    <Route path="groups" element={<OrderAutomationGroupsPage />} />
                    <Route path="settings" element={<OrderAutomationSettingsPage />} />
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
                  <Route path="racks/*" element={<CartsRacks />} />
                  <Route path="zones" element={<CartsZones />} />
                  <Route path="optimizer" element={<FleetPlanner />} />
                </Route>
                <Route path="changelog" element={<Changelog />} />
                <Route path="carts/:id" element={<CartDetails />} />
                <Route path="optimizer" element={<Navigate to="/carts/optimizer" replace />} />
                {/* Waves UI stub hidden — backend /waves remains. Operator flow: WMS picking. */}
                <Route path="waves" element={<Navigate to="/wms/picking" replace />} />
                <Route path="designer" element={<WarehouseDesigner />} />
                <Route path="warehouse-designer" element={<WarehouseDesigner />} />
                <Route path="office/damages" element={<OfficeDamagesPage />} />
                <Route path="office/damage-reports" element={<OfficeDamageReportsPage />} />
                {/* DELETE_CANDIDATE: superseded by /labels — keep until cleanup; not in menu. */}
                <Route path="barcode-management" element={<BarcodeManagement />} />
                {/* LEGACY technical stock list — not Magazyn → Inwentaryzacja (/inventory-count). */}
                <Route path="inventory" element={<InventoryList />} />
                <Route path="administracja-magazynem" element={<Navigate to="/designer" replace />} />
                <Route path="zarzadzanie-magazynem" element={<AnalizyModuleLayout />}>
                  <Route index element={<Navigate to="pulpit" replace />} />
                  <Route path="pulpit" element={<PulpitKierownikaPage />} />
                  <Route path="kolejnosc-dostaw" element={<KolejnoscDostawPage />} />
                  <Route path="raporty" element={<AnalyticsLayout />}>
                    <Route index element={<Navigate to="inventory-value" replace />} />
                    <Route path="inventory-value" element={<InventoryValue />} />
                    <Route path="dead-stock" element={<DeadStock />} />
                    <Route path="hot-products" element={<HotProducts />} />
                    <Route path="product-affinity" element={<ProductAffinity />} />
                    <Route path="hot-locations" element={<HotLocations />} />
                    <Route path="picking-analysis" element={<PickingAnalysis />} />
                    <Route path="sales-forecast" element={<SalesForecastAnalytics />} />
                    <Route path="bundle-intelligence" element={<BundleIntelligence />} />
                    <Route path="warehouse-map" element={<WarehouseMap />} />
                  </Route>
                  <Route path="plan-zmian" element={<OptymalizacjaLayout />}>
                    <Route index element={<OptymalizacjaLandingPage />} />
                    <Route path="plan" element={<PlanZmianPage />} />
                    <Route path="historia" element={<HistoriaZmianPage />} />
                    <Route path="ranking" element={<RankingZmianPage />} />
                    <Route path="slotting" element={<Slotting />} />
                    <Route path="picking-strategy" element={<PickingStrategy />} />
                    <Route path="pick-path" element={<PickPathSimulation />} />
                  </Route>
                </Route>
                {/* Legacy → Zarządzanie magazynem */}
                <Route path="pulpit-kierownika" element={<Navigate to="/zarzadzanie-magazynem/pulpit" replace />} />
                <Route path="centrum-operacyjne" element={<Navigate to="/zarzadzanie-magazynem/pulpit" replace />} />
                <Route path="analytics/warehouse-operations" element={<Navigate to="/zarzadzanie-magazynem/pulpit" replace />} />
                <Route path="analytics/live-warehouse" element={<Navigate to="/zarzadzanie-magazynem/pulpit" replace />} />
                <Route path="analytics" element={<Navigate to="/zarzadzanie-magazynem/raporty" replace />} />
                <Route path="analytics/dashboard" element={<Navigate to="/zarzadzanie-magazynem/raporty" replace />} />
                <Route path="analytics/inventory-value" element={<Navigate to="/zarzadzanie-magazynem/raporty/inventory-value" replace />} />
                <Route path="analytics/dead-stock" element={<Navigate to="/zarzadzanie-magazynem/raporty/dead-stock" replace />} />
                <Route path="analytics/product-rotation" element={<Navigate to="/zarzadzanie-magazynem/raporty/hot-products" replace />} />
                <Route path="analytics/hot-products" element={<Navigate to="/zarzadzanie-magazynem/raporty/hot-products" replace />} />
                <Route path="analytics/product-affinity" element={<Navigate to="/zarzadzanie-magazynem/raporty/product-affinity" replace />} />
                <Route path="analytics/walking-cost" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/pick-path" replace />} />
                <Route path="analytics/hot-locations" element={<Navigate to="/zarzadzanie-magazynem/raporty/hot-locations" replace />} />
                <Route path="analytics/pick-density" element={<Navigate to="/zarzadzanie-magazynem/raporty/hot-locations" replace />} />
                <Route path="analytics/picking-analysis" element={<Navigate to="/zarzadzanie-magazynem/raporty/picking-analysis" replace />} />
                <Route path="analytics/sales-forecast" element={<Navigate to="/zarzadzanie-magazynem/raporty/sales-forecast" replace />} />
                <Route path="analytics/batch-picking" element={<Navigate to="/zarzadzanie-magazynem/raporty/hot-products" replace />} />
                <Route path="analytics/bundle-intelligence" element={<Navigate to="/zarzadzanie-magazynem/raporty/bundle-intelligence" replace />} />
                <Route path="analytics/warehouse-map" element={<Navigate to="/zarzadzanie-magazynem/raporty/warehouse-map" replace />} />
                <Route path="analytics/pick-path-simulation" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/pick-path" replace />} />
                <Route path="analytics/warehouse-day-simulation" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/pick-path" replace />} />
                <Route path="analytics/pick-time-simulation" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/picking-strategy" replace />} />
                <Route path="analytics/worker-flow-simulation" element={<Navigate to="/zarzadzanie-magazynem/pulpit" replace />} />
                <Route path="analytics/slotting" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/slotting" replace />} />
                <Route path="analytics/picking-strategy" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/picking-strategy" replace />} />
                <Route path="analytics/layout-optimization" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/slotting" replace />} />
                <Route path="analytics/warehouse-throughput" element={<Navigate to="/zarzadzanie-magazynem/raporty/inventory-value" replace />} />
                <Route path="analytics/picking-issues-dead-stock" element={<Navigate to="/zarzadzanie-magazynem/raporty/dead-stock" replace />} />
                <Route path="optymalizacja" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian" replace />} />
                <Route path="optymalizacja/plan" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/plan" replace />} />
                <Route path="optymalizacja/historia" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/historia" replace />} />
                <Route path="optymalizacja/ranking" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/ranking" replace />} />
                <Route path="optymalizacja/slotting" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/slotting" replace />} />
                <Route path="optymalizacja/picking-strategy" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/picking-strategy" replace />} />
                <Route path="optymalizacja/pick-path" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/pick-path" replace />} />
                <Route path="analysis" element={<Navigate to="/zarzadzanie-magazynem/pulpit" replace />} />
                <Route path="analiza" element={<Navigate to="/zarzadzanie-magazynem/pulpit" replace />} />
                <Route path="analysis/dashboard" element={<Navigate to="/zarzadzanie-magazynem/pulpit" replace />} />
                <Route path="analysis/inventory-value" element={<Navigate to="/zarzadzanie-magazynem/raporty/inventory-value" replace />} />
                <Route path="analysis/dead-stock" element={<Navigate to="/zarzadzanie-magazynem/raporty/dead-stock" replace />} />
                <Route path="analysis/product-rotation" element={<Navigate to="/zarzadzanie-magazynem/raporty/hot-products" replace />} />
                <Route path="analysis/hot-products" element={<Navigate to="/zarzadzanie-magazynem/raporty/hot-products" replace />} />
                <Route path="analysis/product-pairs" element={<Navigate to="/zarzadzanie-magazynem/raporty/product-affinity" replace />} />
                <Route path="analysis/walking-cost" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/pick-path" replace />} />
                <Route path="analysis/pick-heatmap" element={<Navigate to="/zarzadzanie-magazynem/raporty/hot-locations" replace />} />
                <Route path="analysis/pick-density" element={<Navigate to="/zarzadzanie-magazynem/raporty/hot-locations" replace />} />
                <Route path="analysis/warehouse-operations" element={<Navigate to="/zarzadzanie-magazynem/pulpit" replace />} />
                <Route path="analysis/live-warehouse" element={<Navigate to="/zarzadzanie-magazynem/pulpit" replace />} />
                <Route path="analiza/centrum-operacyjne" element={<Navigate to="/zarzadzanie-magazynem/pulpit" replace />} />
                <Route path="analysis/picking-analysis" element={<Navigate to="/zarzadzanie-magazynem/raporty/picking-analysis" replace />} />
                <Route path="analysis/sales-forecast" element={<Navigate to="/zarzadzanie-magazynem/raporty/sales-forecast" replace />} />
                <Route path="analysis/batch-picking" element={<Navigate to="/zarzadzanie-magazynem/raporty/hot-products" replace />} />
                <Route path="analysis/bundle-intelligence" element={<Navigate to="/zarzadzanie-magazynem/raporty/bundle-intelligence" replace />} />
                <Route path="analysis/pick-path-simulation" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/pick-path" replace />} />
                <Route path="analysis/warehouse-day-simulation" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/pick-path" replace />} />
                <Route path="analysis/pick-time-simulation" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/picking-strategy" replace />} />
                <Route path="analysis/worker-flow-simulation" element={<Navigate to="/zarzadzanie-magazynem/pulpit" replace />} />
                <Route path="analysis/slotting" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/slotting" replace />} />
                <Route path="analysis/picking-strategy" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/picking-strategy" replace />} />
                <Route path="analysis/layout-optimization" element={<Navigate to="/zarzadzanie-magazynem/plan-zmian/slotting" replace />} />
                <Route path="analysis/warehouse-throughput" element={<Navigate to="/zarzadzanie-magazynem/raporty/inventory-value" replace />} />
                <Route path="analysis/warehouse-map" element={<Navigate to="/zarzadzanie-magazynem/raporty/warehouse-map" replace />} />
                <Route path="analysis/picking-issues-dead-stock" element={<Navigate to="/zarzadzanie-magazynem/raporty/dead-stock" replace />} />
                <Route path="system" element={<SystemLayout />}>
                  <Route index element={<Navigate to="health" replace />} />
                  <Route path="health" element={<SystemHealth />} />
                  <Route path="db-size" element={<SystemDbSize />} />
                  <Route path="metrics" element={<SystemMetrics />} />
                  <Route path="errors" element={<SystemErrorLogs />} />
                  <Route path="changelog" element={<SystemChangelog />} />
                  <Route path="labels" element={<SystemAppDictionaryPage />} />
                </Route>
                <Route path="templates" element={<Navigate to="/templates/labels" replace />} />
                <Route path="templates/labels/*" element={<LabelSystem />} />
                <Route path="templates/print" element={<DocumentTemplatesLayout />}>
                  <Route element={<DocumentTemplatesModuleFrame />}>
                    <Route index element={<DocumentTemplatesListPage />} />
                    <Route path="new" element={<DocumentTemplateCreatePage />} />
                    <Route path="starters" element={<StarterGalleryPage />} />
                    <Route path="starters/:starterId" element={<StarterDetailPage />} />
                    <Route path=":templateId" element={<DocumentTemplateEditorPage />} />
                  </Route>
                </Route>
                <Route path="templates/messages/*" element={<MessageTemplatesModule />} />
                <Route path="templates/exports" element={<ExportsPage />} />
                <Route path="templates/exports/new" element={<ExportEditorPage />} />
                <Route path="templates/exports/:id" element={<ExportEditorPage />} />
                <Route path="labels/*" element={<RedirectLabelsToTemplatesLabels />} />
                <Route path="system-etykiet/*" element={<RedirectSystemEtykietToLabels />} />
                {/* Planning placeholders removed — purchasing is the product path. */}
                <Route path="planning/deliveries" element={<Navigate to="/purchasing/dashboard" replace />} />
                <Route path="planning/list" element={<Navigate to="/purchasing/dashboard" replace />} />
                <Route path="*" element={<RouteNotFoundThrow />} />
      </Route>
      </Route>
    </Route>
  ),
)