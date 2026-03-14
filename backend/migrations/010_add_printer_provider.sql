-- Add QZ Tray / direct-print fields to printers.
-- provider: e.g. 'qz' for QZ Tray; NULL for existing/PDF-only printers.
-- system_printer_name: OS printer name used by QZ (e.g. 'Zebra GK420').

ALTER TABLE printers ADD COLUMN provider TEXT;
ALTER TABLE printers ADD COLUMN system_printer_name TEXT;
