import { lazy, type ComponentType, type LazyExoticComponent } from "react";

import { isStaleChunkError, tryStaleChunkReload } from "./staleChunkRecovery";

type DefaultExportModule<T extends ComponentType<unknown>> = { default: T };

/**
 * React.lazy with one-shot full reload when Vite chunk import fails after deploy.
 * Ordinary runtime errors inside the module are rethrown unchanged.
 */
export function lazyWithStaleChunkRecovery<T extends ComponentType<unknown>>(
  factory: () => Promise<DefaultExportModule<T>>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (isStaleChunkError(err) && tryStaleChunkReload()) {
        // Hang suspense until unload — avoid flashing route error mid-reload.
        return new Promise<DefaultExportModule<T>>(() => undefined);
      }
      throw err;
    }
  });
}
