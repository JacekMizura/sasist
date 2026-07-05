import { Navigate, Route, Routes } from "react-router-dom";

import DocumentTemplatesModuleFrame from "./DocumentTemplatesModuleFrame";
import { DocumentTemplateCreatePage } from "./DocumentTemplateCreatePage";
import { DocumentTemplateEditorPage } from "./DocumentTemplateEditorPage";
import { DocumentTemplatesListPage } from "./DocumentTemplatesListPage";
import { StarterGalleryPage } from "./StarterGalleryPage";

export default function DocumentTemplatesModule() {
  return (
    <Routes>
      <Route element={<DocumentTemplatesModuleFrame />}>
        <Route index element={<DocumentTemplatesListPage />} />
        <Route path="new" element={<DocumentTemplateCreatePage />} />
        <Route path="starters" element={<StarterGalleryPage />} />
      </Route>
      <Route path=":templateId" element={<DocumentTemplateEditorPage />} />
      <Route path="*" element={<Navigate to="/settings/document-templates" replace />} />
    </Routes>
  );
}
