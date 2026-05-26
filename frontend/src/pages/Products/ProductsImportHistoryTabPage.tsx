import ImportHistoryPage from "../Import/ImportHistoryPage";

export default function ProductsImportHistoryTabPage() {
  return (
    <ImportHistoryPage
      typeFilter="products"
      backTo="/products/list"
      backLabel="← Lista produktów"
    />
  );
}
