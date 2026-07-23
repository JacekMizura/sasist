/**
 * Centralized UI labels, table headers, and sidebar names.
 * Defaults live here; runtime resolution goes through getLabel(key, fallback).
 * Use UI_STRINGS in render paths (Proxy → dictionary cache + support mode).
 */

import { getLabel } from "../labels/labelStore";

const UI_STRINGS_DEFAULTS = {
  app: {
    /** Marka aplikacji (sidebar, tytuły). */
    brandMark: "Sasist",
    title: "WMS",
    titleSaaS: "WMS SaaS",
  },

  navigation: {
    /** Catalog / product list (sidebar: Asortyment). */
    assortment: "Asortyment",
    products: "Produkty",
    bundles: "Zestawy",
    manufacturers: "Producenci",
    suppliers: "Dostawcy",
    purchaseOrders: "Zamówienia do dostawców",
    /** Sidebar category: purchasing & replenishment module. */
    purchasingCategory: "Zakupy i planowanie",
    purchasingDashboard: "Pulpit zakupów",
    purchasingReplenishment: "Generator zakupów",
    /** Zakupy: analityka relacji z dostawcami (wcześniej „scorecard”). */
    purchasingSupplierAnalytics: "Ocena dostawców",
    purchasingForecast: "Prognoza zakupów",
    /** ABC/XYZ product segmentation under purchasing module. */
    purchasingAutoReorder: "Auto-uzupełnianie",
    purchasingPriceOpportunities: "Oszczędności zakupowe",
    addProduct: "Dodaj produkt",
    addBundle: "Dodaj zestaw",
    addManufacturer: "Dodaj producenta",
    addSupplier: "Dodaj dostawcę",
    inventory: "Stan magazynowy",
    orders: "Zamówienia",
    carts: "Wózki",
    /** Magazyn — jednostki logistyczne (palety, kartony), nie wózki. */
    warehouseCarriers: "Nośniki",
    import: "Import",
    fleetPlanner: "Planer floty",
    pickingWaves: "Fale kompletacji",
    warehouseDesigner: "Projektant Magazynu",
    barcodeManagement: "Etykiety / Kody kreskowe",
    labelSystem: "System Etykiet",
    setup: "Setup",
    /** Sidebar category + fly-out root (Polish). */
    settingsCategory: "Ustawienia",
    administratorsNav: "Administratorzy",
    /** Przeniesione do Ustawienia → Firma (zachowany klucz dla tłumaczeń). */
    systemSetupNav: "Firma i konfiguracja",
    printersNav: "Drukarki",
    wmsSettings: "Ustawienia WMS",
    /** Panel triage labels for returns list (not WMS workflow statuses). */
    returnPanelStatuses: "Zwroty — statusy panelu",
    /** Panel triage labels for orders list (not system `Order.status`). */
    orderPanelStatuses: "Zamówienia — statusy panelu",
    shippingMethods: "Metody dostawy",
    warehouseMaterials: "Materiały magazynowe",
    /** Magazyn → BDO (opakowania, raport środowiskowy). */
    warehouseBdo: "BDO",
    warehouseMaterialsCartons: "Kartony i opakowania",
    warehouseMaterialsPackaging: "Materiały pakowe",
    /** Panel triage labels for complaints (office only). */
    complaintPanelStatuses: "Reklamacje — statusy panelu",
    analysis: "Analiza",
    system: "System",
    returns: "Zwroty",
    wmsTerminal: "WMS",
    complaints: "Reklamacje",
    locations: "Lokalizacje",
    customersList: "Klienci",
    addCustomer: "Dodaj klienta",
    groups: {
      orders: "Zamówienia",
      warehouse: "Magazyn",
      customers: "Klienci",
    },
    /** Sidebar: read-only documents / reporting (not operational flows). */
    documentsCategory: "Dokumenty",
    documentsSales: "Sprzedaż",
    documentsReturns: "Zwroty",
    documentsWarehouse: "Magazyn",
  },

  warehouse: {
    title: "Projektant Magazynu",
    tabs: {
      live: "Magazyn",
      edit: "Projektant",
    },
    /** Sub-tabs in Projektant Magazynu: only Magazyn and Layout (no Label Designer here). */
    designerSubTabs: {
      magazyn: "Magazyn",
      layoutDesigner: "Projektant Layoutu",
      designing: "Projektowanie",
      routes: "Trasy",
    },
    subTabs: {
      layout: "Layout Magazynu",
      labels: "Etykiety / Kody kreskowe",
    },
    columns: {
      name: "Nazwa",
      occupancy: "Zajętość (%)",
      occupancyDm3: "Zajętość (dm³)",
    },
    summary: {
      title: "PODSUMOWANIE PROJEKTU",
      totalCapacity: "Pojemność całkowita:",
      freeCapacity: "Wolna pojemność:",
      locationsBins: "Lokalizacje:",
      reserveOverstock: "Lokalizacja zapasowa:",
      clickRackHint: "Kliknij regał, aby zobaczyć stan i zajętość.",
      totalRacks: "Regały:",
      totalBins: "Biny:",
      reserveCount: "w tym",
      reserveSuffix: "Rezerwa",
      dimensions: "Wymiary (W × D × H):",
      presetLabel: "Regał (preset)",
      rackCount: "Liczba regałów:",
      totalLocations: "Łącznie lokalizacji:",
      primaryLabel: "Podstawowe:",
      reserveLabel: "Rezerwa:",
    },
    selector: {
      selectWarehouse: "— wybierz magazyn —",
      newWarehouse: "+ Nowy magazyn",
      syncSaved: "Sync z DB",
      notSaved: "Nie zapisano",
      savedToDb: "Zapisano w DB",
      unsavedChanges: "Zmiany niezapisane",
    },
    modal: {
      newWarehouse: "Nowy magazyn",
      warehousePlaceholder: "np. Magazyn Główny",
      cancel: "Anuluj",
      create: "Utwórz",
    },
    rackSidebar: {
      catalog: "Layout i szablony",
      exportLocationsCsv: "Pobierz lokalizacje",
      rackSearchPlaceholder: "Szukaj regału...",
      currentRow: "Aktualny rząd",
      locationsPerLevelShort: "lok./poz.",
      visualElements: "Elementy wizualne",
      gapCm: "Odstęp (cm):",
      deleteTemplateConfirm: "Usunąć szablon z katalogu? Regały na planie pozostaną.",
      dm3: "dm³",
      newTemplate: "+ Nowy Szablon",
      rackList: "Lista regałów",
      noRacks: "Brak regałów",
      dragOntoPlan: "Przeciągnij na plan",
      noTemplatesHint: "Brak szablonów. Utwórz szablon w oknie modalnym.",
      rowToolHint: "Rysuj linię na planie, aby utworzyć rząd. Bez szablonu = puste sloty; z szablonem = od razu regały. Później przeciągnij szablon do pustego slotu.",
      saveLayout: "Zapisz układ",
      saving: "Zapisywanie…",
    },
    export: {
      button: "Eksportuj",
      pdf: "PDF",
      csv: "CSV",
      json: "JSON",
      pdfFailed: "Eksport PDF nie powiódł się.",
    },
    rackProperties: {
      title: "Właściwości",
      levelsBins: "Poziomy / Pozycje",
    },
    visuals: {
      toFront: "Na wierzch",
      toBack: "Na dół",
      bringForward: "Do przodu",
      sendBackward: "Do tyłu",
      delete: "Usuń",
      deleteAisle: "Usuń strefę",
      name: "Nazwa",
      column: "Słupy",
      mezzanine: "Antresole",
      packingStation: "Stanowiska pakowania",
      cart: "Wózki",
      wall: "Ściany",
      door: "Drzwi",
      zone: "Strefa przyjęć/wysyłki",
    },
    templateCreator: {
      name: "Nazwa",
      namePlaceholder: "np. Regał wysokie palety",
      binsPerLevel: "Biny/poziom",
    },
    internalLayout: {
      occupancy: "Zajętość:",
      primary: "Główna",
      reserve: "Rezerwa",
    },
    pdfExport: {
      warehouseLabel: "Magazyn:",
      exportDate: "Data eksportu:",
    },
  },

  labels: {
    categories: {
      warehouse: "Magazyn",
      fleet: "Wózki",
      cart: "Wózek",
      basket: "Koszyk",
      product_basic: "Podstawowe",
      product_pricing: "Ceny i VAT",
      product_logistics: "Wymiary i logistyka",
      product_batch: "Partie i seryjne",
      product_origin: "Producent i pochodzenie",
      product_regulations: "Regulacje",
      product_media: "Multimedia",
      orders: "Zamówienia",
    },
    templateType: "Typ szablonu",
    previewData: "Podgląd danych",
    presets: {
      cartLabel: "Szablon etykiety wózka",
      basketLabel: "Szablon etykiety koszyka",
    },
    panel: {
      layers: "Warstwy",
      layersHint:
        "Kolejność (góra = z przodu). Kliknij wiersz, by wybrać. Ctrl lub ⌘ + klik — wielokrotny wybór (tylko wiersze główne).",
      convertToRepeater: "Konwertuj na układ powtarzalny",
      convertToRepeaterHint:
        "Wybierz co najmniej jeden element główny na płótnie lub w zakładce Warstwy (Ctrl/⌘ + klik — wiele). Zagnieżdżonych elementów i istniejących powtórzeń nie można konwertować.",
      layersUp: "Wyżej (w przód)",
      layersDown: "Niżej (w tył)",
      layersToggleHide: "Ukryj",
      layersToggleShow: "Pokaż",
      variables: "Zmienne",
      variablesHint: "Kliknij zmienną, aby wstawić ją na środek etykiety.",
      elementProperties: "Właściwości elementu",
      clickToEdit: "Kliknij element, aby edytować (obrót, kolory, tekst pionowy, ikony).",
    },
    designer: {
      labelDesigner: "Projektant etykiet",
      printQueue: "Kolejka druku",
      template: "Szablon:",
      templateName: "Nazwa szablonu",
      widthMm: "Szer. (mm)",
      heightMm: "Wys. (mm)",
      dpi: "DPI (drukarki termiczne: 203–300)",
      conditionalFormatting: "Formatowanie warunkowe",
      conditionalHint: "Kolory etykiet wg typu lokalizacji (np. Rezerwa → czerwone tło)",
      conditionIf: "JEŚLI",
      conditionFillColor: "Kolor (warunek)",
      deleteRule: "Usuń regułę",
      conditionFieldTitle: "Pole",
      conditionOperatorTitle: "Operator",
      conditionValuePlaceholder: "wartość",
      addRule: "+ Dodaj regułę",
      addElement: "Dodaj element",
      barcode: "Kod kreskowy",
      dynamicText: "Tekst (powiązanie)",
      staticText: "Tekst stały",
      line: "Linia",
      rect: "Prostokąt",
      statusIcon: "Ikona statusu",
      iconLibrary: "Biblioteka ikon (strzałki)",
      templateLibrary: "Biblioteka szablonów",
      loadSavedTemplate: "Wybierz zapisany szablon",
      saveCurrent: "Zapisz bieżący",
      saveTemplate: "Zapisz szablon",
      removeFromLibrary: "Usuń z biblioteki",
    },
    elementProps: {
      xMm: "X (mm)",
      yMm: "Y (mm)",
      widthMm: "Szer. (mm)",
      heightMm: "Wys. (mm)",
      rotation: "Obrót (°)",
      cornerRadiusMm: "Zaokrąglenie rogów (mm)",
      backgroundColor: "Kolor tła",
      textColor: "Kolor tekstu/obrysu",
      format: "Format",
      dataBinding: "Powiązanie danych",
      showValue: "Pokaż wartość",
      binding: "Powiązanie",
      fontSize: "Rozmiar czcionki",
      align: "Wyrównanie",
      bold: "Pogrubienie",
      verticalText: "Tekst pionowy",
      text: "Tekst",
      icon: "Ikona",
      condition: "Warunek",
      deleteElement: "Usuń element",
    },
    align: {
      left: "Lewo",
      center: "Środek",
      right: "Prawo",
    },
    conditions: {
      reserve: "Rezerwa",
      primary: "Główna",
      bottomLevel: "Dolna półka",
      always: "Zawsze",
    },
    icons: {
      none: "Brak",
      lock: "Kłódka (rezerwa)",
      heavyLoad: "Ciężar (dolna półka)",
      hazard: "Uwaga",
      arrowUp: "Strzałka ↑",
      arrowDown: "Strzałka ↓",
      arrowLeft: "Strzałka ←",
      arrowRight: "Strzałka →",
    },
    iconConditions: {
      always: "Zawsze",
      reserve: "Tylko rezerwa",
      bottomLevel: "Tylko dolna półka",
    },
  },

  common: {
    delete: "Usuń",
    cancel: "Anuluj",
    save: "Zapisz",
    create: "Utwórz",
    edit: "Edytuj",
    close: "Zamknij",
  },
} as const;

function deepLabelProxy(obj: Record<string, unknown>, prefix: string): Record<string, unknown> {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
      const value = target[prop as string];
      const key = prefix ? `${prefix}.${String(prop)}` : String(prop);
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        return deepLabelProxy(value as Record<string, unknown>, key);
      }
      if (typeof value === "string") {
        return getLabel(key, value);
      }
      return value;
    },
  });
}

/** Resolved labels (dictionary cache + fallback defaults). */
export const UI_STRINGS = deepLabelProxy(
  UI_STRINGS_DEFAULTS as unknown as Record<string, unknown>,
  "",
) as typeof UI_STRINGS_DEFAULTS;

/** Raw defaults for seeding / docs (never go through custom overrides). */
export const UI_STRINGS_DEFAULTS_EXPORT = UI_STRINGS_DEFAULTS;

export type UIStrings = typeof UI_STRINGS_DEFAULTS;
