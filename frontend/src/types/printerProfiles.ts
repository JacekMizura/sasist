export interface PrinterProfile {
  id: number;
  name: string;
  dpi?: number;
  offset_x_mm: number;
  offset_y_mm: number;
  scale: number;
  agent_printer_id?: number | null;
}
