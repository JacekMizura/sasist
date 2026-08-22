**UI SSOT Phase D cleanup — PASS (2026-08-22).**

Commit: Remove legacy ERP UI token facades.
- Removed unused oa* primitive exports; kept workflow tokens only
- Removed productLikeInputClass/FieldLabelClass and companyInputClass re-export
- CustomersListPage + PurchaseSalesBlockLinePanel → DS buttons/FormField
- Arch 46 PASS; build PASS; WMS 0

STOP — remaining debt: visual designers (audit only), app-shell appInputClass for carts module.
