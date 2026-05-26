/**

 * Display-only Polish labels for WMS warehouse location type tokens.

 * Internal enums / API values stay unchanged (e.g. PICK, BUFFER).

 */



const WMS_LOCATION_TYPE_LABEL_PL: Record<string, string> = {

  /** Podstawowa (pick face / primary) */

  PICK: "PODSTAWOWA",

  KOMPLETACJA: "PODSTAWOWA",

  PRIMARY: "PODSTAWOWA",

  PODSTAWOWA: "PODSTAWOWA",

  PICK_START: "PODSTAWOWA",

  START: "PODSTAWOWA",



  /** Zapas (buffer / reserve / overstock) */

  BUFFER: "ZAPAS",

  BUFOR: "ZAPAS",

  RESERVE: "ZAPAS",

  RESERVED: "ZAPAS",

  ZAPAS: "ZAPAS",

  ZAPASOWA: "ZAPAS",

  OVERSTOCK: "ZAPAS",



  /** Sklepowa (retail / shop floor) */

  STORE: "SKLEPOWA",

  SHOP: "SKLEPOWA",

  SHOP_FLOOR: "SKLEPOWA",

  RETAIL: "SKLEPOWA",

  SKLEPOWA: "SKLEPOWA",

  SKLEP: "SKLEPOWA",



  BULK: "MASOWE",

  STORAGE: "MAGAZYN",

  RECEIVE: "PRZYJĘCIE",

  RECEIVING: "PRZYJĘCIE",

  INBOUND: "PRZYJĘCIE",

  RETURN: "ZWROTY",

  RETURNS: "ZWROTY",

  DAMAGE: "USZKODZONE",

  DAMAGED: "USZKODZONE",

  SHIPPING: "WYSYŁKA",

  PACKING: "WYSYŁKA",

  OUTBOUND: "WYSYŁKA",

  QC: "KONTROLA",

  QUALITY: "KONTROLA",

  QUALITY_CONTROL: "KONTROLA",

  DOCK: "PRZYJĘCIE",

  NORMAL: "STANDARD",

  FLOOR: "MASOWE",

};



function normalizeWarehouseLocationTypeKey(type: unknown): string {

  return String(type ?? "")

    .trim()

    .toUpperCase()

    .replace(/[\s-]+/g, "_");

}



/** True when `value` is a known WMS location-type token (not a free-form location code). */

export function isKnownWarehouseLocationTypeToken(value: unknown): boolean {

  const key = normalizeWarehouseLocationTypeKey(value);

  if (!key) return false;

  if (WMS_LOCATION_TYPE_LABEL_PL[key]) return true;

  const lower = String(value ?? "").trim().toLowerCase();

  return (

    lower === "pick" ||

    lower === "reserve" ||

    lower === "floor" ||

    lower === "kompletacja" ||

    lower === "bufor" ||

    lower === "sklepowa" ||

    lower === "sklep"

  );

}



/**

 * Maps API / badge kind tokens to Polish UI labels.

 * Unknown values are returned unchanged (e.g. location codes like A1-A-2).

 */

export function formatWarehouseLocationTypeLabel(type: unknown): string {

  const raw = String(type ?? "").trim();

  if (!raw) return "";



  const key = normalizeWarehouseLocationTypeKey(raw);

  const mapped = WMS_LOCATION_TYPE_LABEL_PL[key];

  if (mapped) return mapped;



  const lower = raw.toLowerCase();

  if (lower === "pick" || lower === "kompletacja" || lower === "primary" || lower === "podstawowa") {

    return WMS_LOCATION_TYPE_LABEL_PL.PICK;

  }

  if (

    lower === "reserve" ||

    lower === "buffer" ||

    lower === "bufor" ||

    lower === "zapas" ||

    lower === "zapasowa"

  ) {

    return WMS_LOCATION_TYPE_LABEL_PL.BUFFER;

  }

  if (

    lower === "store" ||

    lower === "shop" ||

    lower === "sklep" ||

    lower === "sklepowa" ||

    lower === "retail" ||

    lower === "shop-floor" ||

    lower === "shop_floor"

  ) {

    return WMS_LOCATION_TYPE_LABEL_PL.STORE;

  }

  if (lower === "floor") return WMS_LOCATION_TYPE_LABEL_PL.BULK;



  return raw;

}


