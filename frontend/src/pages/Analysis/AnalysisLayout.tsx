import WmsModuleLayout from "../../components/layout/WmsModuleLayout";
import { ANALYSIS_TABS } from "../../constants/analysisTabs";

/**
 * Analiza module: sidebar "Analiza" navigates to /analysis/dashboard.
 * Top tabs for all analysis sections (Dashboard, Zalegający towar, Batch picking, etc.).
 */
export default function AnalysisLayout() {
  return <WmsModuleLayout title="Analiza" tabs={ANALYSIS_TABS} exact />;
}
