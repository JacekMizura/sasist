import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { WarehouseProvider } from "./context/WarehouseContext"
import { CartsRefreshProvider } from "./context/CartsRefreshContext"

import MainLayout from "./layout/MainLayout"
import ErrorBoundary from "./components/ErrorBoundary"

import Dashboard from "./pages/Dashboard"
import ProductsLayout from "./pages/Products/ProductsLayout"
import ProductList from "./pages/Products/ProductList"
import ProductDetail from "./pages/Products/ProductDetail"
import OrdersLayout from "./pages/Orders/OrdersLayout"
import OrderList from "./pages/Orders/OrderList"
import ImportPage from "./pages/Import/ImportPage"
import ImportHistoryPage from "./pages/Import/ImportHistoryPage"
import CartsLayout from "./pages/CartsLayout"
import CartsBulk from "./pages/CartsBulk"
import CartsBaskets from "./pages/CartsBaskets"
import CartsRacks from "./pages/CartsRacks"
import CartsZones from "./pages/CartsZones"
import Setup from "./pages/Setup"
import PrintersPage from "./pages/Settings/PrintersPage"
import Changelog from "./pages/Changelog"
import CartDetails from "./pages/CartDetails"
import FleetPlanner from "./pages/FleetPlanner"
import PickingWaves from "./pages/PickingWaves"
import WarehouseDesigner from "./pages/WarehouseDesigner"
import BarcodeManagement from "./pages/BarcodeManagement"
import LabelSystem from "./pages/LabelSystem"
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

function App() {
  return (
    <WarehouseProvider>
      <CartsRefreshProvider>
        <BrowserRouter>
          <MainLayout>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/products" element={<ProductsLayout />}>
                  <Route index element={<Navigate to="list" replace />} />
                  <Route path="list" element={<ProductList />} />
                  <Route path=":id" element={<ProductDetail />} />
                  <Route path="import" element={<ImportPage defaultType="products" />} />
                </Route>
                <Route path="/orders" element={<OrdersLayout />}>
                  <Route index element={<Navigate to="list" replace />} />
                  <Route path="list" element={<OrderList />} />
                  <Route path="import" element={<ImportPage defaultType="orders" />} />
                </Route>
                <Route path="/carts" element={<CartsLayout />}>
                  <Route index element={<Navigate to="bulk" replace />} />
                  <Route path="bulk" element={<CartsBulk />} />
                  <Route path="baskets" element={<CartsBaskets />} />
                  <Route path="racks" element={<CartsRacks />} />
                  <Route path="zones" element={<CartsZones />} />
                </Route>
                <Route path="/setup" element={<Setup />} />
                <Route path="/setup/printers" element={<PrintersPage />} />
                <Route path="/changelog" element={<Changelog />} />
                <Route path="/carts/:id" element={<CartDetails />} />
                <Route path="/optimizer" element={<FleetPlanner />} />
                <Route path="/waves" element={<PickingWaves />} />
                <Route path="/designer" element={<WarehouseDesigner />} />
                <Route path="/warehouse-designer" element={<WarehouseDesigner />} />
                <Route path="/barcode-management" element={<BarcodeManagement />} />
                <Route path="/inventory" element={<InventoryList />} />
                <Route path="/analytics" element={<AnalyticsLayout />}>
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
                <Route path="/analysis" element={<Navigate to="/analytics/dashboard" replace />} />
                <Route path="/analysis/dashboard" element={<Navigate to="/analytics/dashboard" replace />} />
                <Route path="/analysis/inventory-value" element={<Navigate to="/analytics/inventory-value" replace />} />
                <Route path="/analysis/dead-stock" element={<Navigate to="/analytics/dead-stock" replace />} />
                <Route path="/analysis/product-rotation" element={<Navigate to="/analytics/product-rotation" replace />} />
                <Route path="/analysis/hot-products" element={<Navigate to="/analytics/hot-products" replace />} />
                <Route path="/analysis/product-pairs" element={<Navigate to="/analytics/product-affinity" replace />} />
                <Route path="/analysis/walking-cost" element={<Navigate to="/analytics/walking-cost" replace />} />
                <Route path="/analysis/pick-heatmap" element={<Navigate to="/analytics/hot-locations" replace />} />
                <Route path="/analysis/pick-density" element={<Navigate to="/analytics/pick-density" replace />} />
                <Route path="/analysis/picking-analysis" element={<Navigate to="/analytics/picking-analysis" replace />} />
                <Route path="/analysis/sales-forecast" element={<Navigate to="/analytics/sales-forecast" replace />} />
                <Route path="/analysis/batch-picking" element={<Navigate to="/analytics/batch-picking" replace />} />
                <Route path="/analysis/pick-path-simulation" element={<Navigate to="/analytics/pick-path-simulation" replace />} />
                <Route path="/analysis/warehouse-day-simulation" element={<Navigate to="/analytics/warehouse-day-simulation" replace />} />
                <Route path="/analysis/pick-time-simulation" element={<Navigate to="/analytics/pick-time-simulation" replace />} />
                <Route path="/analysis/worker-flow-simulation" element={<Navigate to="/analytics/worker-flow-simulation" replace />} />
                <Route path="/analysis/slotting" element={<Navigate to="/analytics/slotting" replace />} />
                <Route path="/analysis/picking-strategy" element={<Navigate to="/analytics/picking-strategy" replace />} />
                <Route path="/analysis/layout-optimization" element={<Navigate to="/analytics/layout-optimization" replace />} />
                <Route path="/analysis/warehouse-throughput" element={<Navigate to="/analytics/warehouse-throughput" replace />} />
                <Route path="/analysis/warehouse-map" element={<Navigate to="/analytics/warehouse-map" replace />} />
                <Route path="/analysis/picking-issues-dead-stock" element={<Navigate to="/analytics/picking-issues-dead-stock" replace />} />
                <Route path="/system" element={<SystemLayout />}>
                  <Route index element={<Navigate to="health" replace />} />
                  <Route path="health" element={<SystemHealth />} />
                  <Route path="db-size" element={<SystemDbSize />} />
                  <Route path="metrics" element={<SystemMetrics />} />
                  <Route path="errors" element={<SystemErrorLogs />} />
                  <Route path="changelog" element={<SystemChangelog />} />
                </Route>
                <Route path="/labels/*" element={<LabelSystem />} />
                <Route path="/system-etykiet/*" element={<LabelSystem />} />
                <Route path="/planning/deliveries" element={<PlanningPlaceholder />} />
                <Route path="/planning/list" element={<PlanningPlaceholder />} />
                <Route path="/import" element={<Navigate to="/products/import" replace />} />
                <Route path="/import/history" element={<ImportHistoryPage />} />
              </Routes>
            </ErrorBoundary>
          </MainLayout>
        </BrowserRouter>
      </CartsRefreshProvider>
    </WarehouseProvider>
  )
}

export default App