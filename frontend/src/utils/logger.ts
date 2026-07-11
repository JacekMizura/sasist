const isDev = import.meta.env.DEV;

/** Set to `true` to allow extra verbose `log(...)` calls gated with `if (DEBUG)`. */
export const DEBUG = false;

export function log(...args: unknown[]): void {
  if (isDev) console.log(...args);
}

export function info(...args: unknown[]): void {
  if (isDev) console.info(...args);
}

export function debug(...args: unknown[]): void {
  if (isDev) console.debug(...args);
}

export function trace(...args: unknown[]): void {
  if (isDev) console.trace(...args);
}

export function table(...args: unknown[]): void {
  if (isDev) console.table(...args);
}

export function warn(...args: unknown[]): void {
  if (isDev) console.warn(...args);
}

/** Critical failures — survives in source; stripped in production via esbuild.drop. */
export function error(...args: unknown[]): void {
  console.error(...args);
}
