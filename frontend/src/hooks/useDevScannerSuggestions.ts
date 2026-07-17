/** Backward-compatible re-export — catalog is the SSOT for scanner suggestions. */
export {
  useDevScannerCatalog as useDevScannerSuggestions,
  useDevScannerCatalog,
} from "./useDevScannerCatalog";
export type { DevScannerCatalogItem as DevScannerSuggestion } from "../components/wms/dev-scanner/types";
