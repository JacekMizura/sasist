# ADR-002: Why WebSocket as primary realtime channel

**Status:** Accepted  
**Date:** 2026-07-27  
**Context:** Job delivery latency, remote diagnostics, device events, update signals.

## Decision

Use **WebSocket (WSS)** as the primary realtime channel between Agent and ERP. Keep **HTTPS poll** as fallback (and for large payloads / legacy protocol 0).

## Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| HTTP poll only | Simple, already exists | Latency, load, poor remote commands |
| MQTT | Good IoT | Extra infra, another auth story |
| SignalR-only | Nice .NET DX | Ties protocol to one stack; harder polyglot agents |

## Rationale

- Push `JOB_CREATED` / `JOB_CANCELLED` without 5s poll delay  
- Bidirectional diagnostics, log upload requests, update signals  
- Works through standard HTTPS load balancers with WSS  
- Documented envelope independent of SignalR so protocol stays portable  

## Consequences

- Backend must run WS gateway for `/api/agent/v1/ws`  
- Agent Core implements reconnect + fallback to poll  
- Message catalog frozen in `ws-protocol-v1.md`  
