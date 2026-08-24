# Current context

- Automation `generate_document` expanded: SALE FV/PA + WAREHOUSE WZ/RZ via `create_document_from_series`; overrides (payment term, sale date, description, auto-print + workstation); picker filters to real handlers only.
- Overrides stored for SALE in `buyer_json.issuance`; print via `queue_print_job(commit=False)`.
- Unsupported in picker: CORRECTION, PZ/PW/RW/MM/Z_PZ (no create_from_series handler).
- Document series UI: split-pane workspace on `/documents/series/*`.
- Document trigger architecture: warehouse docs only via explicit triggers; pick/OWR do NOT auto-create WZ/RZ.
- Packing still FV/PA only. Z-PZ / production PW-RW unchanged domain exceptions.
