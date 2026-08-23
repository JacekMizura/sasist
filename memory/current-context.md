**Order Activity audit coverage — PASS (2026-08-23).**

- After `7bb614fe`: priority, document series, warehouse assign, bundle add, customer link actor, remove ITEM/LINE projection dedup
- Logi Historia default expanded (key remount + `defaultCollapsed={false}`); footer collapsed
- Intentional gaps: note edit/delete (no API), billing street (PATCH schema unused / no apply), generic Docs upload (FE without BE), Detail UI warehouse panel unmounted / series selector absent
- Carton / CF files / documents / WMS ops: existing projection — no duplicate writers
