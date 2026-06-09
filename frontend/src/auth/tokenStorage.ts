import { getRememberMePreference, setRememberMePreference } from "./authSessionPrefs";

const ACCESS = "wms_access_token";
const REFRESH = "wms_refresh_token";

function activeStorage(): Storage {
  return getRememberMePreference() ? localStorage : sessionStorage;
}

function readFromEither(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function clearKeyEverywhere(key: string): void {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getStoredAccessToken(): string | null {
  return readFromEither(ACCESS);
}

export function getStoredRefreshToken(): string | null {
  return readFromEither(REFRESH);
}

export function setStoredTokens(access: string, refresh: string, rememberMe?: boolean): void {
  if (rememberMe !== undefined) {
    setRememberMePreference(rememberMe);
  }
  clearKeyEverywhere(ACCESS);
  clearKeyEverywhere(REFRESH);
  const storage = activeStorage();
  storage.setItem(ACCESS, access);
  storage.setItem(REFRESH, refresh);
}

export function clearStoredTokens(): void {
  clearKeyEverywhere(ACCESS);
  clearKeyEverywhere(REFRESH);
}
