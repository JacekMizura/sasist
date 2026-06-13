import { Navigate, Route, Routes } from "react-router-dom";

import ConsolidationRackEditorPage from "./carts/consolidation-racks/ConsolidationRackEditorPage";
import ConsolidationRackPreviewPage from "./carts/consolidation-racks/ConsolidationRackPreviewPage";
import ConsolidationRacksListPage from "./carts/consolidation-racks/ConsolidationRacksListPage";

export default function CartsRacks() {
  return (
    <div className="animate-in fade-in duration-300">
      <Routes>
        <Route index element={<ConsolidationRacksListPage />} />
        <Route path="new" element={<ConsolidationRackEditorPage />} />
        <Route path=":rackId/preview" element={<ConsolidationRackPreviewPage />} />
        <Route path=":rackId/edit" element={<ConsolidationRackEditorPage />} />
        <Route path=":rackId" element={<Navigate to="preview" replace />} />
      </Routes>
    </div>
  );
}
