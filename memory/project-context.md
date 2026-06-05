# Project Context

- **WMS shortage lifecycle:** single SSOT `RecoveryWorkflowService`; see `memory/wms-stabilization.md`. Stabilization mode — no new sync/workflow layers.

- Repository: warehouse analysis / warehouse designer application.
- Frontend includes warehouse canvas rendering, rack interactions, route visualization, and sidebar-driven workflows.
- Backend route generation should not be changed when working on route readability unless explicitly requested.
- For this project, persistent AI memory must be stored only in the workspace `memory/` directory.
