**WMS topbar pin config — PASS (2026-08-23).**

## Root cause
- N× independent `useWmsPinnedModes()` (Home + TopBar + ExecutionStrip) each with own state + debounced PUT → stale writers overwrite / topbar ignores settings
- Auth `/me` pins never patched after PUT → remount re-hydrated old pins
- Settings list was registry order (not pin `order`) → ↑/↓ looked like no-ops

## Fix
- Shared in-memory store + single persist pipeline; `patchWmsTopbarPins` on Auth after save
- Settings list: pinned by `order`, then unpinned
- Tests: mutations, persist+re-read, UI handlers

## SSOT
`user_wms_profiles.wms_topbar_pins_json` (`{key, pinned, order}`); FE mirror is not a second lifecycle engine.
