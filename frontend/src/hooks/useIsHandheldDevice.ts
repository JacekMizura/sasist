import { useMediaQuery } from "./useMediaQuery";

/**
 * Handheld / collector viewport — coarse pointer or narrow screen.
 * Used only to choose WMS home layout (desktop vs list), not to fork APIs.
 */
export function useIsHandheldDevice(): boolean {
  const coarse = useMediaQuery("(pointer: coarse)");
  const narrow = useMediaQuery("(max-width: 900px)");
  return coarse || narrow;
}
