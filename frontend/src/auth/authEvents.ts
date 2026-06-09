export const AUTH_SESSION_EXPIRED_EVENT = "sasist:auth-session-expired";

export function emitAuthSessionExpired(): void {
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
}
