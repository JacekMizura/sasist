import type { ManufacturerRead } from "../api/manufacturersApi";
import type { ProductImageEntry, ProductLabelData } from "../types/productLabel";

export function parseLabelData(meta: unknown): ProductLabelData {
  if (meta == null || typeof meta !== "object" || Array.isArray(meta)) return {};
  const raw = (meta as Record<string, unknown>).label_data;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  return {
    product_name_pl: o.product_name_pl != null ? String(o.product_name_pl) : undefined,
    importer_name: o.importer_name != null ? String(o.importer_name) : undefined,
    importer_address: o.importer_address != null ? String(o.importer_address) : undefined,
    batch_number: o.batch_number != null ? String(o.batch_number) : undefined,
    series_number: o.series_number != null ? String(o.series_number) : undefined,
    requires_ce_mark: typeof o.requires_ce_mark === "boolean" ? o.requires_ce_mark : undefined,
    material_composition: o.material_composition != null ? String(o.material_composition) : undefined,
    care_instructions: o.care_instructions != null ? String(o.care_instructions) : undefined,
    size_or_length: o.size_or_length != null ? String(o.size_or_length) : undefined,
    country_of_origin: o.country_of_origin != null ? String(o.country_of_origin) : undefined,
    show_price_on_label: typeof o.show_price_on_label === "boolean" ? o.show_price_on_label : undefined,
  };
}

export function parseProductImages(meta: unknown): ProductImageEntry[] {
  if (meta == null || typeof meta !== "object" || Array.isArray(meta)) return [];
  const raw = (meta as Record<string, unknown>).product_images;
  if (!Array.isArray(raw)) return [];
  const out: ProductImageEntry[] = [];
  raw.forEach((item, idx) => {
    if (item == null || typeof item !== "object" || Array.isArray(item)) return;
    const r = item as Record<string, unknown>;
    const url = String(r.image_url ?? r.url ?? "").trim();
    if (!url) return;
    out.push({
      id: String(r.id ?? crypto.randomUUID()),
      image_url: url,
      is_main: Boolean(r.is_main),
      sort_order: typeof r.sort_order === "number" && Number.isFinite(r.sort_order) ? r.sort_order : idx,
    });
  });
  return out.sort((a, b) => a.sort_order - b.sort_order);
}

function labelDataHasContent(ld: ProductLabelData): boolean {
  if (ld.product_name_pl?.trim()) return true;
  if (ld.importer_name?.trim() || ld.importer_address?.trim()) return true;
  if (ld.batch_number?.trim() || ld.series_number?.trim()) return true;
  if (ld.requires_ce_mark === true) return true;
  if (ld.material_composition?.trim() || ld.care_instructions?.trim() || ld.size_or_length?.trim()) return true;
  if (ld.country_of_origin?.trim()) return true;
  if (ld.show_price_on_label === true) return true;
  return false;
}

export function normalizeImagesOrder(images: ProductImageEntry[]): ProductImageEntry[] {
  return [...images]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img, i) => ({ ...img, sort_order: i }));
}

/** At most one `is_main`; defaults to first image. */
export function ensureSingleMainImage(images: ProductImageEntry[]): ProductImageEntry[] {
  const sorted = normalizeImagesOrder(images);
  if (sorted.length === 0) return [];
  const mainIdx = sorted.findIndex((i) => i.is_main);
  const idx = mainIdx >= 0 ? mainIdx : 0;
  return sorted.map((img, i) => ({ ...img, is_main: i === idx }));
}

function normalizeLabelDataForSave(ld: ProductLabelData): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  const set = (k: keyof ProductLabelData, v: unknown) => {
    if (v === undefined || v === null) return;
    if (typeof v === "string" && !v.trim()) return;
    o[k] = v;
  };
  set("product_name_pl", ld.product_name_pl?.trim());
  set("importer_name", ld.importer_name?.trim());
  set("importer_address", ld.importer_address?.trim());
  set("batch_number", ld.batch_number?.trim());
  set("series_number", ld.series_number?.trim());
  if (ld.requires_ce_mark === true) o.requires_ce_mark = true;
  set("material_composition", ld.material_composition?.trim());
  set("care_instructions", ld.care_instructions?.trim());
  set("size_or_length", ld.size_or_length?.trim());
  set("country_of_origin", ld.country_of_origin?.trim());
  if (ld.show_price_on_label === true) o.show_price_on_label = true;
  return o;
}

export function buildProductMetadataJson(
  existing: unknown,
  parts: {
    productUi: { responsible_person: string; responsible_person_email: string; vat_rate: string; promotion: string };
    labelData: ProductLabelData;
    productImages: ProductImageEntry[];
  },
): string | undefined {
  let root: Record<string, unknown> = {};
  const hadExisting =
    existing != null && typeof existing === "object" && !Array.isArray(existing) && Object.keys(existing as object).length > 0;
  if (existing != null && typeof existing === "object" && !Array.isArray(existing)) {
    root = { ...(existing as Record<string, unknown>) };
  }

  const ui = parts.productUi;
  const trimmedUi = {
    responsible_person: ui.responsible_person.trim(),
    responsible_person_email: ui.responsible_person_email.trim(),
    vat_rate: ui.vat_rate.trim(),
    promotion: ui.promotion.trim(),
  };
  const hasUi = Object.values(trimmedUi).some((v) => v.length > 0);
  if (hasUi) {
    root.product_ui = trimmedUi;
  } else {
    const prevUi = root.product_ui;
    if (prevUi != null && typeof prevUi === "object" && !Array.isArray(prevUi)) {
      const rest = { ...(prevUi as Record<string, unknown>) };
      delete rest.shipping_time_days;
      if (Object.keys(rest).length > 0) {
        root.product_ui = rest;
      } else {
        delete root.product_ui;
      }
    } else {
      delete root.product_ui;
    }
  }

  if (labelDataHasContent(parts.labelData)) {
    root.label_data = normalizeLabelDataForSave(parts.labelData);
  } else {
    delete root.label_data;
  }

  const imgsNorm = ensureSingleMainImage(parts.productImages);
  if (imgsNorm.length > 0) {
    root.product_images = imgsNorm.map((img, i) => ({
      id: img.id,
      image_url: img.image_url.trim(),
      is_main: Boolean(img.is_main),
      sort_order: i,
    }));
  } else {
    delete root.product_images;
  }

  if (Object.keys(root).length === 0) {
    return hadExisting ? "{}" : undefined;
  }
  return JSON.stringify(root);
}

export function manufacturerLabelBlock(m: ManufacturerRead | undefined): { name: string; address: string } {
  if (!m) return { name: "", address: "" };
  const name = (m.company_name || m.name || "").trim();
  const street = (m.street ?? "").trim();
  const cityLine = [m.postal_code, m.city].filter(Boolean).join(" ").trim();
  const addrParts = [street, cityLine, (m.country ?? "").trim()].filter(Boolean);
  return { name, address: addrParts.join("\n") };
}

export function pickMainImageUrl(images: ProductImageEntry[], fallbackUrl: string): string | undefined {
  const sorted = ensureSingleMainImage(images);
  const main = sorted.find((i) => i.is_main) ?? sorted[0];
  const u = main?.image_url?.trim();
  if (u) return u;
  const f = fallbackUrl.trim();
  return f || undefined;
}
