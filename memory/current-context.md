# current-context

## Active

**Primary Button Design System** — egzekwowanie jednego standardu Primary CTA (wzorzec: Ustawienia → Użytkownicy → „Dodaj użytkownika”).

### SSOT
- Komponent: `frontend/src/design-system/PrimaryButton.tsx`
- Token: `brandPrimaryButtonClass` w `frontend/src/design-system/brandUi.ts` (pomarańczowy `h-10 rounded-lg bg-orange-500 …`)
- Referencja UI: `AdministratorsModuleFrame.tsx`
- `AppButton variant="primary"` → deleguje do `PrimaryButton`

### Wyjątki (celowo poza DS Primary)
- `pages/wms/**`, `components/wms/**`, operator touch (`damage/WmsReturnsPage`, WmsProductionExecute*)
- Login (branding indigo)
- Destructive red, overlays, badge/tab/chip/segmented, Filtruj amber (`filterToolbarBtnApply`)

### Constraints
Bez commit/push (dopóki user nie poprosi).
