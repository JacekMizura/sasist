/**
 * Human-facing copy for workforce / audit / activity — keep internal codes out of UI.
 */

/** Order UI status main_group (often English enum) → Polish bucket for managers. */
export function translateMainGroup(raw: string | null | undefined): string {
  const u = (raw ?? "").trim();
  if (!u) return "Inna grupa";
  const key = u.toUpperCase().replace(/\s+/g, "_");
  const map: Record<string, string> = {
    NEW: "Nowe",
    IN_PROGRESS: "W trakcie",
    DONE: "Zakończone",
    COMPLETED: "Zakończone",
    ARCHIVED: "Archiwum",
    CANCELLED: "Anulowane",
    OPEN: "Otwarte",
    CLOSED: "Zamknięte",
  };
  return map[key] ?? u.replace(/_/g, " ");
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.login": "Zalogowano do panelu",
  "auth.logout": "Wylogowano z panelu",
  "WMS_RECEIVING.pz_start": "Rozpoczęto przyjęcie (nowa dostawa)",
  "WMS_RECEIVING.scan_product": "Zeskanowano produkt na PZ",
  "WMS_RECEIVING.scan_carrier_activate": "Aktywowano nośnik na PZ",
  "WMS_RECEIVING.scan_carrier_create": "Utworzono / przypisano nośniki do PZ",
  "WMS_RECEIVING.pz_finish": "Zakończono przyjęcie PZ",
  "WMS_PUTAWAY.scan_carrier_putaway": "Rozlokowano cały nośnik",
  "WMS_PUTAWAY.scan_product_putaway": "Rozlokowano produkt",
  "WMS_PUTAWAY.putaway_finish": "Zakończono rozlokowanie PZ",
  "WMS_MOVEMENTS.scan_movement": "Wykonano przesunięcie MM",
  "WMS_MOVEMENTS.scan_replenishment": "Uzupełnienie braków (pick)",
  "WMS_MOVEMENTS.scan_replenishment_task": "Uzupełnienie wg zadania",
  "WMS_CARRIERS.carrier_create": "Utworzono nośnik",
  "WMS_CARRIERS.carrier_bulk_create": "Utworzono serię nośników",
  "auth.change_password": "Zmieniono hasło",
  "users.create": "Dodano pracownika",
  "users.update": "Zaktualizowano dane pracownika",
  "users.delete": "Usunięto konto",
  "users.avatar_upload": "Zmieniono zdjęcie profilowe",
  "users.reset_password": "Wysłano / ustawiono nowe hasło",
  "permission_presets.create": "Utworzono szablon uprawnień",
  "permission_presets.update": "Zaktualizowano szablon uprawnień",
  "permission_presets.delete": "Usunięto szablon uprawnień",
};

export function humanizeAuditAction(action: string | null | undefined): string {
  const a = (action ?? "").trim();
  if (!a) return "Zdarzenie";
  if (AUDIT_ACTION_LABELS[a]) return AUDIT_ACTION_LABELS[a];
  const mod = a.includes(".") ? a.split(".")[0] : "";
  const tail = a.includes(".") ? a.slice(a.indexOf(".") + 1) : a;
  if (mod && tail) {
    const modLabel = humanizeModule(mod);
    const actLabel = humanizeActivityAction(tail);
    if (actLabel !== "Operacja w magazynie") return `${modLabel}: ${actLabel}`;
  }
  return "Działanie w systemie";
}

const MODULE_LABELS: Record<string, string> = {
  auth: "Logowanie",
  users: "Pracownicy",
  permissions: "Uprawnienia",
  workforce: "Zespół",
  orders: "Zamówienia",
  WMS_RECEIVING: "WMS — Przyjęcie",
  WMS_PUTAWAY: "WMS — Rozlokowanie PZ",
  WMS_MOVEMENTS: "WMS — Przesunięcia",
  WMS_CARRIERS: "WMS — Nośniki",
  wms_receiving: "WMS — Przyjęcie",
  wms_putaway: "WMS — Rozlokowanie PZ",
  wms_movements: "WMS — Przesunięcia",
  wms_carriers: "WMS — Nośniki",
};

export function humanizeModule(module: string | null | undefined): string {
  const m = (module ?? "").trim();
  if (!m) return "—";
  if (MODULE_LABELS[m]) return MODULE_LABELS[m];
  if (MODULE_LABELS[m.toUpperCase()]) return MODULE_LABELS[m.toUpperCase()];
  return MODULE_LABELS[m.toLowerCase()] ?? m.replace(/_/g, " ");
}

const ENTITY_LABELS: Record<string, string> = {
  AppUser: "Konto pracownika",
  UserPermission: "Uprawnienia konta",
  PermissionPreset: "Szablon uprawnień",
  StockDocument: "Dokument magazynowy (PZ)",
  StockDocumentItem: "Pozycja PZ",
  WarehouseCarrier: "Nośnik magazynowy",
  ReplenishmentTask: "Zadanie uzupełnienia",
};

export function humanizeEntityType(entityType: string | null | undefined): string {
  const t = (entityType ?? "").trim();
  if (!t) return "";
  return ENTITY_LABELS[t] ?? "Powiązany zapis";
}

/** Strip technical keys from audit detail for display; never surface IP. */
export function auditDetailLines(detail: Record<string, unknown> | null | undefined): string[] {
  if (!detail || typeof detail !== "object") return [];
  const skip = new Set(["ip", "client_ip", "ip_address", "user_agent", "request_id"]);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(detail)) {
    if (skip.has(k)) continue;
    if (v == null || v === "") continue;
    const label =
      k === "login"
        ? "Login"
        : k === "email"
          ? "E-mail"
          : k === "role"
            ? "Rola"
            : k.replace(/_/g, " ");
    lines.push(`${label}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  return lines.slice(0, 6);
}

const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  login: "Logowanie",
  logout: "Wylogowanie",
  scan: "Skan",
  pick: "Kompletacja",
  pack: "Pakowanie",
  picking: "Kompletacja",
  packing: "Pakowanie",
  pz_start: "Rozpoczęto PZ",
  pz_finish: "Zakończono PZ",
  scan_product: "Skan produktu",
  scan_carrier_activate: "Aktywacja nośnika",
  scan_carrier_create: "Nośniki na PZ",
  scan_carrier_putaway: "Rozlokowanie PZ — nośnik",
  scan_product_putaway: "Rozlokowanie PZ — produkt",
  putaway_finish: "Koniec rozlokowania PZ",
  scan_movement: "Przesunięcie",
  scan_replenishment: "Uzupełnienie braków",
  scan_replenishment_task: "Zadanie uzupełnienia",
  carrier_create: "Nowy nośnik",
  carrier_bulk_create: "Seria nośników",
};

export function humanizeActivityAction(actionType: string | null | undefined): string {
  const a = (actionType ?? "").trim().toLowerCase();
  if (!a) return "Czynność";
  const direct = ACTIVITY_ACTION_LABELS[a];
  if (direct) return direct;
  const tail = a.includes(".") ? (a.split(".").pop() ?? a) : a;
  return ACTIVITY_ACTION_LABELS[tail] ?? "Operacja w magazynie";
}
