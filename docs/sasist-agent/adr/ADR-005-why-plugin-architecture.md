# ADR-005: Why Plugin architecture

**Status:** Accepted  
**Date:** 2026-07-27  
**Context:** Agent must be more than a print daemon; features evolve at different speeds.

## Decision

Ship a **plugin architecture** (`IAgentModule`) with in-process modules for v1; Printing is the first plugin. External DLL loading is reserved for v2+.

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Monolithic agent | Faster MVP | Cannot isolate features; every change risks print path |
| One EXE per device class | Isolation | Multiple trays/services; UX nightmare |
| Scriptable plugins | Flexible | Security and support burden |

## Rationale

- Clear lifecycle: Initialize / Start / Stop / Heartbeat / HandleCommand / CollectDiagnostics / Dispose  
- Matches product roadmap (scanners, scales, …)  
- In-process keeps RAM and install simple for warehouses  

## Consequences

- SDK contract is part of Etap 0 freeze  
- Host must tolerate module failure without full crash  
- New features = new module (or extend Printing only when truly print-specific)  
