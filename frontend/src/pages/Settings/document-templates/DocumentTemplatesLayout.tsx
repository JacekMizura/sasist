import { Outlet, useLocation } from "react-router-dom";

import PageLayout from "../../../components/layout/PageLayout";
import { TEMPLATES_MODULE_PAGE_CARD_CLASS } from "../../LabelSystem/templatesList/templatesListLayout";

export default function DocumentTemplatesLayout() {
  const { pathname } = useLocation();
  const isEditor = /^\/templates\/print\/(?!new$|starters$)\d+/.test(pathname);

  return (
    <PageLayout
      fullBleed
      fillHeight={isEditor}
      cardClassName={
        isEditor ? "flex min-h-0 flex-1 flex-col overflow-hidden p-0" : TEMPLATES_MODULE_PAGE_CARD_CLASS
      }
    >
      <Outlet />
    </PageLayout>
  );
}
