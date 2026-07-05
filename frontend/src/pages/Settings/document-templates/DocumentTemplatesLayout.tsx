import { Outlet, useLocation } from "react-router-dom";

import PageLayout from "../../../components/layout/PageLayout";

const EDITOR_PATH = /^\/settings\/document-templates\/(?!new$)\d+/;

export default function DocumentTemplatesLayout() {
  const { pathname } = useLocation();
  const isEditor = EDITOR_PATH.test(pathname);

  if (isEditor) {
    return (
      <PageLayout fullBleed>
        <Outlet />
      </PageLayout>
    );
  }

  return (
    <PageLayout fullBleed cardClassName="relative min-h-[600px] w-full">
      <Outlet />
    </PageLayout>
  );
}
