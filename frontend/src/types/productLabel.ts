/** Stored under `metadata_json.label_data` */
export type ProductLabelData = {
  product_name_pl?: string;
  importer_name?: string;
  importer_address?: string;
  batch_number?: string;
  series_number?: string;
  requires_ce_mark?: boolean;
  material_composition?: string;
  care_instructions?: string;
  size_or_length?: string;
  country_of_origin?: string;
  show_price_on_label?: boolean;
};

/** Stored under `metadata_json.product_images` */
export type ProductImageEntry = {
  id: string;
  image_url: string;
  is_main: boolean;
  sort_order: number;
};
