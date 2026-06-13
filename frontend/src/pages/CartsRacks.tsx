import { Route, Routes } from "react-router-dom";

import ConsolidationRackEditorPage from "./wms/consolidation/ConsolidationRackEditorPage";
import ConsolidationRacksListPage from "./wms/consolidation/ConsolidationRacksListPage";

export default function CartsRacks() {
  return (
    <div className="animate-in fade-in duration-300">
      <Routes>
        <Route index element={<ConsolidationRacksListPage />} />
        <Route path="new" element={<ConsolidationRackEditorPage />} />
        <Route path=":rackId" element={<ConsolidationRackEditorPage />} />
      </Routes>
    </div>
  );
}
