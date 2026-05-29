# Tier 1 Analysis — Sentry Alerts

This doc covers the production Sentry alert rules backing Tier 1 modular
contract analysis. Routing is via the existing **Sentry → Slack** integration
(see project memory `error-routing`); this doc is the SOP, not the vendor pick.

Companion: [`tier1-kpis.md`](./tier1-kpis.md) — KPI dashboard and "where to
look first" decision tree.

---

## `PERSONA_INVALID` alert

Fires when the current `persona_versions.content` row fails `PersonaSchema`
parse at request time inside `app/api/contracts/analyze/route.ts`. Indicates
that the publish path was bypassed (e.g. direct SQL write) or the row was
corrupted. **No new analyses can run for that persona until reconciled.**

### Trigger

- **Source:** Sentry message `persona_invalid` captured from
  `app/api/contracts/analyze/route.ts` (step 9, `PERSONA_INVALID` branch).
- **Filter:** `event.tags.event:persona_invalid`
- **Threshold:** count ≥ 1 in 5 minutes (every occurrence pages — this is a
  data-corruption event, not a flake).

### Routing

- **Channel:** existing Sentry → Slack integration (per project memory
  `error-routing`). If the Slack channel isn't yet pinned, route to
  `#TODO-channel-from-error-routing-memory` and update once the
  observability sprint lands the integration mapping.
- **On-call:** Alex (PagerDuty for off-hours per spec § PERSONA_INVALID
  Recovery SOP).

### Resolution playbook

1. Open the Sentry issue. **Note `persona_version_id` from the tags.**
2. Connect to the production DB (Supabase Studio or `psql` via the
   service-role connection string from 1Password).
3. Inspect the offending row:

   ```sql
   SELECT content FROM persona_versions WHERE id = '<persona_version_id-from-tag>';
   ```

4. Re-parse against `PersonaSchema` locally to see the exact validation
   error. From the repo root:

   ```bash
   # Save the content JSON locally, then:
   cd lib/prompt && pnpm tsx -e "
     import { PersonaSchema } from './persona-types';
     const c = require('./tmp-content.json');
     console.log(PersonaSchema.safeParse(c).error);
   "
   ```

5. **Recover.** Pick one:
   - **(a) Preferred — Admin UI:** publish a corrected v2 via the persona
     admin console (`/admin/personas/<id>`). The publish path recomputes
     `content_hash` and atomically flips `is_current`.
   - **(b) Fallback — direct SQL** (only if the admin UI is itself broken):
     hand-fix the JSON; recompute `content_hash` using the pattern in
     `scripts/_seed/persona-v1-hash.ts`; update the row in a transaction.
     Do NOT skip the hash recompute — `app/api/contracts/analyze/route.ts`
     asserts `personaHash === content_hash` and will throw 500 on drift.

6. **Verify.** Hit `POST /api/contracts/analyze` against any contract.
   Expect 200; the `PERSONA_INVALID` alert auto-resolves on the next
   successful run. **No app restart is needed** — the route loads the
   persona row per request.

### Sentry alert-rule setup (manual)

Sentry alert rules aren't checked into code; configure once via the dashboard:

- **Project:** `lexai`
- **Alert rule name:** `Tier 1 Analysis · PERSONA_INVALID`
- **Type:** Issue alert
- **Conditions:**
  - When an event is captured
  - AND `event.tags.event` equals `persona_invalid`
  - AND issue is seen ≥ 1 time in 5m
- **Actions:** Send Slack notification via the existing Sentry → Slack
  integration to `#TODO-channel-from-error-routing-memory` (replace once
  observability sprint pins the channel name).
- **Environment filter:** `production` only (skip staging — local repro
  uses staging).

### Validation (post-setup)

Fire a synthetic alert from **staging, never production**:

1. In staging DB, corrupt the current procurement persona content:
   ```sql
   BEGIN;
   UPDATE persona_versions
      SET content = jsonb_set(content, '{required_fields}', '"not-an-array"'::jsonb)
    WHERE id = (
      SELECT current_version_id FROM personas WHERE id = 'procurement'
    );
   -- Don't update content_hash — the route's hash check would intercept first.
   -- The PERSONA_INVALID path triggers on PersonaSchema parse failure, which
   -- this corruption causes before the hash check runs.
   ```
2. POST to `/api/contracts/analyze` against any contract in staging.
3. Confirm 500 response with `code: PERSONA_INVALID`, then confirm the
   Slack message arrives within 1 minute.
4. **Rollback:** `ROLLBACK;` the staging transaction. Do not commit.

---

## Other alerts

These pieces are documented in [`tier1-kpis.md`](./tier1-kpis.md), not here:

- `cron.invariants.drift` — Sentry **warning** event from
  `/api/cron/invariants`. Pages only if drift persists across two consecutive
  weekly runs.
- High `MODEL_ERROR` / `GROUNDING_FAIL` / `PUBLISH_ERROR` rates — query-based
  alerts driven from `analysis_runs.diagnostics`; see KPI table.
