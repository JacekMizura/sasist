# current-context

## Active

**LIVE: NO_PENDING_SOURCE_LOCATION after source_lock** — FE `activeLocationId` ≠ server lock; controlled re-accept. Commit local; **do not push**.

## Exact root cause

After PUT clears `source_lock`, `nextActiveLocationIdAfterDetail` keeps UI location 276. Basket gated on `activeLocationId`, not server accept → 409. Fix: `ensureServerSourceForBasket` awaits accept/re-accept before confirm.
