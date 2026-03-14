export interface Printer {
  id: number;
  name: string;
  profile_id: number | null;
  warehouse_id?: number | null;
  connection_type?: string | null;
  description?: string | null;
  provider?: string | null;
  system_printer_name?: string | null;
  profile?: {
    id: number;
    name: string;
    offset_x_mm: number;
    offset_y_mm: number;
    scale: number;
    dpi?: number | null;
  } | null;
}
