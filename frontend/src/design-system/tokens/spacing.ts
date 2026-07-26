/**
 * Spacing scale (px → Tailwind). Only these values are allowed in UI Kit.
 * 4 | 8 | 12 | 16 | 20 | 24 | 32 | 48
 */

export const space = {
  1: "0.25rem", // 4
  2: "0.5rem", // 8
  3: "0.75rem", // 12
  4: "1rem", // 16
  5: "1.25rem", // 20
  6: "1.5rem", // 24
  8: "2rem", // 32
  12: "3rem", // 48
} as const;

/** Tailwind spacing utilities mapped to the scale. */
export const spacing = {
  px1: "px-1",
  px2: "px-2",
  px2_5: "px-2.5",
  px3: "px-3",
  px4: "px-4",
  px6: "px-6",
  py1: "py-1",
  py1_5: "py-1.5",
  py2: "py-2",
  py2_5: "py-2.5",
  py3: "py-3",
  py4: "py-4",
  py6: "py-6",
  p2: "p-2",
  p3: "p-3",
  p4: "p-4",
  p6: "p-6",
  gap1: "gap-1",
  gap1_5: "gap-1.5",
  gap2: "gap-2",
  gap3: "gap-3",
  gap4: "gap-4",
  gap6: "gap-6",
  spaceY2: "space-y-2",
  spaceY3: "space-y-3",
  mt3: "mt-3",
  pt4: "pt-4",
  /** Rail / sidebar padding */
  rail: "px-4 py-4",
} as const;
