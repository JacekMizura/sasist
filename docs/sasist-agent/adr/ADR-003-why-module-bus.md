# ADR-003: Why Module Bus

**Status:** Accepted  
**Date:** 2026-07-27  
**Context:** Multiple feature modules must coexist without tight coupling.

## Decision

Introduce an in-process **Module Bus** (pub/sub) as the only communication path between modules, with Core as the sole ERP transport owner.

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| Direct module references | Simple initially | Impossible to grow; circular deps |
| Out-of-process plugins | Crash isolation | Complexity, IPC, RAM |
| God-object Core callbacks only | Centralized | Core becomes dumping ground |

## Rationale

- Enforces dependency rule: Module ↛ Module  
- Core stays thin: lifecycle, transport, aggregation  
- Future scanner/scale modules plug in without touching Printing  

## Consequences

- SDK includes `IModuleBus`  
- Topics versioned (`bus_v`)  
- Debugging requires correlation ids on bus events  
