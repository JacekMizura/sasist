# current-context

## Active

**Sasist Agent — UI implementation quality (MVP / no flicker)**

Cosmetics paused. Goal: stable WinForms like GitHub Desktop (behavior first).

### Rules in force
- No layout rebuild on heartbeat/polling — values only
- MVP: `ShellPresenter` + `IPageView.ApplyValues` / `ForceSync`
- Layout: Table/Flow/Dock/AutoSize/Min/Max — no Location/Anchor-as-primary
- Cards compute own height; sidebar width from longest nav label; buttons wrap in cards
- DoubleBuffered via `UiBuffering`

### Verify
- `--layout-smoke <dir>` → PASS at 100/125/150/175/200%
- `--stability-test [sec]` → rebuilds=0 during poll ticks (default 60s)

### Paths
- App: `sasist-agent/src/Sasist.Agent.Tray/`
- MVP: `.../Mvp/UiState.cs`
- Smoke shots: `sasist-agent/dist/layout-smoke/`
