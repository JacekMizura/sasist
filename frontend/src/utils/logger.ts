const isDev = import.meta.env.DEV;

/** Set to `true` to allow extra verbose `log(...)` calls gated with `if (DEBUG)`. */
export const DEBUG = false;

export function log(...args: unknown[]): void {
  if (isDev) console.log(...args);
}

export function warn(...args: unknown[]): void {
  if (isDev) console.warn(...args);
}

export function error(...args: unknown[]): void {
  console.error(...args);
}
