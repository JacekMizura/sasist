import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { WarehouseProvider } from "./context/WarehouseContext"
import { CartsRefreshProvider } from "./context/CartsRefreshContext"

import MainLayout from "./layout/MainLayout"
import ErrorBoundary from "./components/ErrorBoundary"

import Dashboard from "./pages/Dashboard"
import ProductsLayout from "./pages/Products/ProductsLayout"
import ProductList from "./pages/Products/ProductList"
import OrdersLayout from "./pages/Orders/OrdersLayout"
import OrderList from "./pages/Orders/OrderList"
import ImportPage from "./pages/Import/ImportPage"
import Carts from "./pages/Carts"
import Setup from "./pages/Setup"
import CartDetails from "./pages/CartDetails"
import FleetPlanner from "./pages/FleetPlanner"
import WarehouseDesigner from "./pages/WarehouseDesigner"
import BarcodeManagement from "./pages/BarcodeManagement"
import LabelSystem from "./pages/LabelSystem"

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
                  <Route path="import" element={<ImportPage defaultType="products" />} />
                </Route>
                <Route path="/orders" element={<OrdersLayout />}>
                  <Route index element={<Navigate to="list" replace />} />
                  <Route path="list" element={<OrderList />} />
                  <Route path="import" element={<ImportPage defaultType="orders" />} />
                </Route>
                <Route path="/carts" element={<Carts />} />
                <Route path="/setup" element={<Setup />} />
                <Route path="/carts/:id" element={<CartDetails />} />
                <Route path="/optimizer" element={<FleetPlanner />} />
                <Route path="/designer" element={<WarehouseDesigner />} />
                <Route path="/warehouse-designer" element={<WarehouseDesigner />} />
                <Route path="/barcode-management" element={<BarcodeManagement />} />
                <Route path="/labels" element={<LabelSystem />} />
                <Route path="/system-etykiet" element={<LabelSystem />} />
              </Routes>
            </ErrorBoundary>
          </MainLayout>
        </BrowserRouter>
      </CartsRefreshProvider>
    </WarehouseProvider>
  )
}

export default App