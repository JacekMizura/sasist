/**
 * Warehouse label presets: generate ready-made templates for the label designer.
 * Compatible with SavedLabelTemplate.template_json / LabelTemplate.
 */

import type { GroupElement, LabelTemplate, TemplateElement } from "../types/labelSystem";

function genId(prefix: string, i: number): string {
  return `${prefix}-${Date.now()}-${i}`;
}

export const PRESET_TYPES = [
  "LOCATION_BASIC",
  "LOCATION_BARCODE_LARGE",
  "RACK_SEGMENT_STRIP",
  "PALLET_LABEL",
  "AISLE_LABEL",
  "FLOOR_LOCATION",
  "RACK_BEAM_MULTISECTION",
] as const;

export type PresetType = (typeof PRESET_TYPES)[number];

/** Nazwy widoczne w UI (PL) — też domyślna nazwa szablonu po wygenerowaniu. */
export const PRESET_LABELS: Record<PresetType, string> = {
  LOCATION_BASIC: "Lokalizacja (podstawowa)",
  LOCATION_BARCODE_LARGE: "Lokalizacja (duży kod kreskowy)",
  RACK_SEGMENT_STRIP: "Pasek segmentu regału",
  PALLET_LABEL: "Etykieta palety",
  AISLE_LABEL: "Etykieta oznaczenia rzędu",
  FLOOR_LOCATION: "Lokalizacja podłogowa",
  RACK_BEAM_MULTISECTION: "Belka regału (wielosekcyjna)",
};

/** Krótki opis zastosowania (karty, modal szybkiego startu). */
export const PRESET_USAGE_HINTS: Record<PresetType, string> = {
  LOCATION_BASIC: "Nazwa lokalizacji i kod kreskowy — typowy format na regał.",
  LOCATION_BARCODE_LARGE: "Większy kod i czytelna nazwa — skan z większej odległości.",
  RACK_SEGMENT_STRIP: "Pas wielu segmentów w jednym szablonie — druk taśmy regałowej.",
  PALLET_LABEL: "Oznaczenie palety w magazynie wysokiego składowania.",
  AISLE_LABEL: "Pionowa etykieta alei / rzędu regałów.",
  FLOOR_LOCATION: "Duża etykieta lokalizacji podłogowej lub strefy.",
  RACK_BEAM_MULTISECTION: "Wiele małych pól na jednej belce — segmentacja belki.",
};

export type PresetCardMeta = {
  widthMm: number;
  heightMm: number;
  /** Krótka etykieta typu kodu (PL). */
  barcodeLabel: string;
  /** Drukarka / technologia (skrót informacyjny). */
  formatLabel: string;
};

export const PRESET_CARD_META: Record<PresetType, PresetCardMeta> = {
  LOCATION_BASIC: { widthMm: 50, heightMm: 30, barcodeLabel: "Kod 128", formatLabel: "Zebra" },
  LOCATION_BARCODE_LARGE: { widthMm: 100, heightMm: 50, barcodeLabel: "Kod 128", formatLabel: "Zebra" },
  RACK_SEGMENT_STRIP: { widthMm: 400, heightMm: 50, barcodeLabel: "Kod 128", formatLabel: "Zebra" },
  PALLET_LABEL: { widthMm: 100, heightMm: 80, barcodeLabel: "Kod 128", formatLabel: "Zebra" },
  AISLE_LABEL: { widthMm: 80, heightMm: 120, barcodeLabel: "Kod 128", formatLabel: "Zebra" },
  FLOOR_LOCATION: { widthMm: 150, heightMm: 80, barcodeLabel: "Kod 128", formatLabel: "Zebra" },
  RACK_BEAM_MULTISECTION: { widthMm: 300, heightMm: 40, barcodeLabel: "Kod 128", formatLabel: "Zebra" },
};

/** Jedna linia metadanych: np. „Lokalizacja • 100 × 50 mm”. */
export function formatPresetSpecLine(type: PresetType): string {
  const m = PRESET_CARD_META[type];
  return `Lokalizacja • ${m.widthMm} × ${m.heightMm} mm`;
}

/**
 * Generate a full LabelTemplate for the given preset type.
 * Compatible with SavedLabelTemplate.template_json; can be loaded into the designer and saved.
 */
export function generatePreset(type: PresetType): LabelTemplate {
  const base = {
    id: `preset-${type}-${Date.now()}`,
    name: PRESET_LABELS[type],
    dpi: 300,
    template_type: "location" as const,
    updatedAt: new Date().toISOString(),
  };

  switch (type) {
    case "LOCATION_BASIC": {
      return {
        ...base,
        widthMm: 50,
        heightMm: 30,
        elements: [
          {
            id: genId("el", 0),
            type: "dynamicText",
            x: 5,
            y: 5,
            width: 40,
            height: 8,
            binding: "loc_name",
            fontSize: 10,
            align: "center",
          },
          {
            id: genId("el", 1),
            type: "barcode",
            x: 5,
            y: 14,
            width: 40,
            height: 12,
            format: "Code128",
            dataBinding: "barcode_data",
            showValue: false,
          },
        ] as TemplateElement[],
      };
    }

    case "LOCATION_BARCODE_LARGE": {
      return {
        ...base,
        widthMm: 100,
        heightMm: 50,
        elements: [
          {
            id: genId("el", 0),
            type: "dynamicText",
            x: 5,
            y: 5,
            width: 90,
            height: 15,
            binding: "loc_name",
            fontSize: 24,
            bold: true,
            align: "center",
          },
          {
            id: genId("el", 1),
            type: "barcode",
            x: 5,
            y: 25,
            width: 90,
            height: 20,
            format: "Code128",
            dataBinding: "barcode_data",
            showValue: false,
          },
        ] as TemplateElement[],
      };
    }

    case "RACK_SEGMENT_STRIP": {
      return {
        ...base,
        widthMm: 400,
        heightMm: 50,
        elements: [
          {
            id: genId("el", 0),
            type: "repeater",
            x: 0,
            y: 0,
            width: 400,
            height: 50,
            dataset: "locations",
            direction: "horizontal",
            itemWidth: 50,
            itemHeight: 50,
            template: {
              elements: [
                {
                  id: genId("grp", 0),
                  type: "group",
                  x: 0,
                  y: 0,
                  width: 50,
                  height: 50,
                  elements: [
                    {
                      id: genId("seg", 0),
                      type: "rect",
                      x: 0,
                      y: 0,
                      width: 50,
                      height: 50,
                      strokeWidth: 1,
                    },
                    {
                      id: genId("seg", 1),
                      type: "dynamicText",
                      x: 5,
                      y: 5,
                      width: 40,
                      height: 12,
                      binding: "loc_name",
                      fontSize: 16,
                      align: "center",
                    },
                    {
                      id: genId("seg", 2),
                      type: "barcode",
                      x: 5,
                      y: 20,
                      width: 40,
                      height: 20,
                      format: "Code128",
                      dataBinding: "barcode_data",
                      showValue: false,
                    },
                  ],
                } satisfies GroupElement,
              ],
            },
          },
        ] as TemplateElement[],
      };
    }

    case "PALLET_LABEL": {
      return {
        ...base,
        widthMm: 100,
        heightMm: 80,
        elements: [
          {
            id: genId("el", 0),
            type: "staticText",
            x: 5,
            y: 5,
            width: 90,
            height: 8,
            text: "PALETA",
            fontSize: 10,
            bold: true,
            align: "center",
          },
          {
            id: genId("el", 1),
            type: "dynamicText",
            x: 5,
            y: 16,
            width: 90,
            height: 18,
            binding: "loc_name",
            fontSize: 22,
            bold: true,
            align: "center",
          },
          {
            id: genId("el", 2),
            type: "barcode",
            x: 10,
            y: 38,
            width: 80,
            height: 30,
            format: "Code128",
            dataBinding: "barcode_data",
            showValue: false,
          },
        ] as TemplateElement[],
      };
    }

    case "AISLE_LABEL": {
      return {
        ...base,
        widthMm: 80,
        heightMm: 120,
        elements: [
          {
            id: genId("el", 0),
            type: "rect",
            x: 2,
            y: 2,
            width: 76,
            height: 116,
            strokeWidth: 2,
            fill: "#1e293b",
          },
          {
            id: genId("el", 1),
            type: "dynamicText",
            x: 5,
            y: 40,
            width: 70,
            height: 40,
            binding: "loc_name",
            fontSize: 32,
            bold: true,
            align: "center",
            textColor: "#ffffff",
          },
          {
            id: genId("el", 2),
            type: "barcode",
            x: 10,
            y: 85,
            width: 60,
            height: 25,
            format: "Code128",
            dataBinding: "barcode_data",
            showValue: false,
          },
        ] as TemplateElement[],
      };
    }

    case "FLOOR_LOCATION": {
      return {
        ...base,
        widthMm: 150,
        heightMm: 80,
        elements: [
          {
            id: genId("el", 0),
            type: "rect",
            x: 0,
            y: 0,
            width: 150,
            height: 80,
            strokeWidth: 3,
            fill: "#fef3c7",
          },
          {
            id: genId("el", 1),
            type: "dynamicText",
            x: 10,
            y: 15,
            width: 130,
            height: 50,
            binding: "loc_name",
            fontSize: 36,
            bold: true,
            align: "center",
          },
          {
            id: genId("el", 2),
            type: "barcode",
            x: 25,
            y: 55,
            width: 100,
            height: 20,
            format: "Code128",
            dataBinding: "barcode_data",
            showValue: false,
          },
        ] as TemplateElement[],
      };
    }

    case "RACK_BEAM_MULTISECTION": {
      return {
        ...base,
        widthMm: 300,
        heightMm: 40,
        elements: [
          {
            id: genId("el", 0),
            type: "repeater",
            x: 0,
            y: 0,
            width: 300,
            height: 40,
            dataset: "locations",
            direction: "horizontal",
            itemWidth: 30,
            itemHeight: 40,
            template: {
              elements: [
                {
                  id: genId("grp", 0),
                  type: "group",
                  x: 0,
                  y: 0,
                  width: 30,
                  height: 40,
                  elements: [
                    {
                      id: genId("bm", 0),
                      type: "rect",
                      x: 0,
                      y: 0,
                      width: 30,
                      height: 40,
                      strokeWidth: 0.5,
                    },
                    {
                      id: genId("bm", 1),
                      type: "dynamicText",
                      x: 2,
                      y: 2,
                      width: 26,
                      height: 10,
                      binding: "loc_name",
                      fontSize: 8,
                      align: "center",
                    },
                    {
                      id: genId("bm", 2),
                      type: "barcode",
                      x: 2,
                      y: 14,
                      width: 26,
                      height: 22,
                      format: "Code128",
                      dataBinding: "barcode_data",
                      showValue: false,
                    },
                  ],
                } satisfies GroupElement,
              ],
            },
          },
        ] as TemplateElement[],
      };
    }

    default: {
      return {
        ...base,
        widthMm: 50,
        heightMm: 30,
        elements: [],
      };
    }
  }
}
