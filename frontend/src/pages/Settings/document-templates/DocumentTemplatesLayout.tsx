import { Outlet, useLocation } from "react-router-dom";

import PageLayout from "../../../components/layout/PageLayout";
import { isTemplatesHubPath } from "../../Templates/templatesPaths";

export default function DocumentTemplatesLayout() {
  const { pathname } = useLocation();
  const inHub = isTemplatesHubPath(pathname);
  const isEditor =
    /^\/(?:templates\/print|settings\/document-templates)\/(?!new$|starters$)\d+/.test(pathname);

  if (inHub) {
    return <Outlet />;
  }

  return (
    <PageLayout
      fullBleed={isEditor}
      fillHeight={isEditor}
      cardClassName={isEditor ? "flex min-h-0 flex-1 flex-col overflow-hidden p-0" : undefined}
    >
      <Outlet />
    </PageLayout>
  );
}
