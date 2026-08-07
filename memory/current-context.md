## Active

**WMS global settings search (2026-08-07).**

- Combobox in `WmsSettingsChrome` header — searches all tabs via `settingsSearch/catalog`
- Min 3 chars; ↑↓ Enter Esc; navigates tab + `?section=` + scroll/focus/flash
- Fields marked with `data-wms-setting-id` / `WmsSettingField`
- Per-tab search removed from `WmsSettingsTabFrame`

**WMS settings section nav = switcher.**

- Left rail mounts one subsection; URL `?section=`
