export const CARRIER_PREFIXES = ["PAL", "BOX", "BIN", "CRT", "MIX"] as const;

export const CARRIER_CREATE_STATUSES = [
  "ACTIVE",
  "EMPTY",
  "INBOUND",
  "PUTAWAY",
  "PICKING",
  "PACKING",
  "SHIPPING",
  "BLOCKED",
  "DAMAGED",
  "ARCHIVED",
] as const;
