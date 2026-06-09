import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { isPublicAppPath, saveLastVisitedPath } from "@/auth/authSessionPrefs";

/** Persists last in-app path for post-login redirect. */
export default function LastPathTracker() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (!isPublicAppPath(pathname)) {
      saveLastVisitedPath(pathname, search);
    }
  }, [pathname, search]);

  return null;
}
