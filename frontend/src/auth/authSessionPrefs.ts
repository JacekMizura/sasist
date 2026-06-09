const REMEMBER_ME = "sasist_remember_me";
const LAST_EMAIL = "sasist_last_login_email";
const LAST_PATH = "sasist_last_path";
const LOGIN_NOTICE = "sasist_login_notice";

export type LoginNotice = "session_expired" | "logged_out" | "account_inactive";

export function getRememberMePreference(): boolean {
  try {
    return localStorage.getItem(REMEMBER_ME) === "1";
  } catch {
    return true;
  }
}

export function setRememberMePreference(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_ME, remember ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function getLastLoginEmail(): string {
  try {
    return localStorage.getItem(LAST_EMAIL)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setLastLoginEmail(email: string): void {
  try {
    const v = email.trim();
    if (v) localStorage.setItem(LAST_EMAIL, v);
  } catch {
    /* ignore */
  }
}

const PUBLIC_PATH_PREFIXES = ["/login", "/wms-upload/"];

export function isPublicAppPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export function saveLastVisitedPath(pathname: string, search = ""): void {
  if (!pathname || isPublicAppPath(pathname)) return;
  try {
    localStorage.setItem(LAST_PATH, `${pathname}${search}`);
  } catch {
    /* ignore */
  }
}

export function getLastVisitedPath(): string | null {
  try {
    const raw = localStorage.getItem(LAST_PATH)?.trim();
    if (!raw || isPublicAppPath(raw.split("?")[0] ?? "")) return null;
    return raw;
  } catch {
    return null;
  }
}

export function resolvePostLoginPath(fallback = "/dashboard"): string {
  const last = getLastVisitedPath();
  return last ?? fallback;
}

export function peekLoginNotice(): LoginNotice | null {
  try {
    const v = sessionStorage.getItem(LOGIN_NOTICE);
    if (v === "session_expired" || v === "logged_out" || v === "account_inactive") return v;
    return null;
  } catch {
    return null;
  }
}

export function setLoginNotice(notice: LoginNotice): void {
  try {
    sessionStorage.setItem(LOGIN_NOTICE, notice);
  } catch {
    /* ignore */
  }
}

export function consumeLoginNotice(): LoginNotice | null {
  const n = peekLoginNotice();
  if (n) {
    try {
      sessionStorage.removeItem(LOGIN_NOTICE);
    } catch {
      /* ignore */
    }
  }
  return n;
}
