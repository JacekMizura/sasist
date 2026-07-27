# ADR-001: Why .NET for Sasist Agent

**Status:** Accepted  
**Date:** 2026-07-27  
**Context:** Choose runtime for Windows edge agent (service, tray, printing, WS, updates, future USB/HID).

## Decision

Use **.NET 8** (Worker Service + tray UI) as the Sasist Agent Host.

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Keep Python | Existing agent | High RAM, weak device APIs long-term, packaging friction |
| Rust | Low RAM, safety | Slow Windows print/USB/UI velocity |
| Go | Good services/WS | Weak native printing & tray story |

## Rationale

- First-class Windows Service and spooler / Win32 interop  
- Mature USB/HID/serial ecosystem for future modules  
- Velopack-class auto-update  
- One language for Host + modules + tray  
- Acceptable RAM vs Python PyInstaller  

## Consequences

- New codebase `sasist-agent/` (.NET); Python agent enters Dual Run then retire  
- SDK surfaces as `IAgentModule` in C#  
- Team invests in .NET build/CI for agent releases  
