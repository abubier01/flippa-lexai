# Tier 1 Analysis — KPI Runbook (first 2 weeks)

What to watch in production for the two weeks after cutover. Source:
`docs/plans/2026-05-27-tier1-modular-analysis-plan.md` § G Dashboard / KPIs.

Companion: [`sentry-alerts.md`](./sentry-alerts.md) — page-worthy alert rules.

Where to view:
- **Supabase SQL editor:** save each query below as a named query
  (`tier1-<metric>`). The SQL is copy-pasteable.
- **Sentry:** views filtered by tag (`event:persona_invalid`,
  `event:invariants_drift`).
- **Vercel logs (or whatever log sink Sentry forwards from):** grep for
  `event=analysis.rejected` for rate-limit and rejection counts.

---

## The 10 metrics

| # | Metric | Query / source | Watch threshold |
|---|--------|----------------|------------------|
| 1 | **Runs/day** | SQL (#1 below) | baseline only |
| 2 | **Success rate** | SQL (#2) | < 95% → investigate |
| 3 | **`OUTPUT_SCHEMA_FAIL` count** | SQL (#3) | > 1/day → provider drift or injection |
| 4 | **`GROUNDING_FAIL` count** | SQL (#4) | > 5% of total → tune threshold OR investigate persona |
| 5 | **`MODEL_ERROR` count** | SQL (#5) | > 1% → provider/network issue |
| 6 | **`PUBLISH_ERROR` count** | SQL (#6) | > 0 → DB infra alert |
| 7 | **`PERSONA_INVALID` count** | Sentry view (#7) | > 0 → page (see `sentry-alerts.md`) |
| 8 | **p50 / p95 latency** | SQL (#8) | p95 > 60s → consider async/streaming |
| 9 | **Cost/day** | SQL (#9) | budget per product call |
| 10 | **`RATE_LIMITED` 429 count by scope** | Log grep (#10) | spike → either abuse or limits set too low |

### (1) Runs/day

```sql
SELECT date_trunc('day', created_at) AS day,
       count(*)                       AS runs
  FROM analysis_runs
 WHERE created_at >= now() - interval '14 days'
 GROUP BY 1
 ORDER BY 1 DESC;
```

Threshold: baseline only — establishes the denominator for other metrics.

### (2) Success rate

```sql
SELECT date_trunc('day', created_at) AS day,
       count(*)                                                AS total,
       count(*) FILTER (WHERE status = 'completed')            AS completed,
       round(100.0 * count(*) FILTER (WHERE status = 'completed')
                   / nullif(count(*), 0), 2)                   AS pct_success
  FROM analysis_runs
 WHERE created_at >= now() - interval '14 days'
 GROUP BY 1
 ORDER BY 1 DESC;
```

Threshold: `pct_success < 95` → investigate.

### (3) `OUTPUT_SCHEMA_FAIL` count

```sql
SELECT date_trunc('day', created_at) AS day, count(*) AS n
  FROM analysis_runs
 WHERE diagnostics @> '[{"code":"OUTPUT_SCHEMA_FAIL"}]'::jsonb
   AND created_at >= now() - interval '14 days'
 GROUP BY 1
 ORDER BY 1 DESC;
```

Threshold: `> 1/day` → provider drift or injection attempt.

### (4) `GROUNDING_FAIL` count

```sql
SELECT date_trunc('day', created_at) AS day,
       count(*) FILTER (WHERE diagnostics @> '[{"code":"GROUNDING_FAIL"}]'::jsonb) AS grounding_fail,
       count(*)                                                                    AS total,
       round(100.0 * count(*) FILTER (WHERE diagnostics @> '[{"code":"GROUNDING_FAIL"}]'::jsonb)
                   / nullif(count(*), 0), 2)                                       AS pct
  FROM analysis_runs
 WHERE created_at >= now() - interval '14 days'
 GROUP BY 1
 ORDER BY 1 DESC;
```

Threshold: `pct > 5` → tune `MIN_SIMILARITY` in `lib/grounding.ts` OR
investigate persona content.

### (5) `MODEL_ERROR` count

```sql
SELECT date_trunc('day', created_at) AS day,
       count(*) FILTER (WHERE diagnostics @> '[{"code":"MODEL_ERROR"}]'::jsonb) AS model_error,
       count(*)                                                                 AS total,
       round(100.0 * count(*) FILTER (WHERE diagnostics @> '[{"code":"MODEL_ERROR"}]'::jsonb)
                   / nullif(count(*), 0), 2)                                    AS pct
  FROM analysis_runs
 WHERE created_at >= now() - interval '14 days'
 GROUP BY 1
 ORDER BY 1 DESC;
```

Threshold: `pct > 1` → provider/network issue.

### (6) `PUBLISH_ERROR` count

```sql
SELECT date_trunc('day', created_at) AS day, count(*) AS n
  FROM analysis_runs
 WHERE diagnostics @> '[{"code":"PUBLISH_ERROR"}]'::jsonb
   AND created_at >= now() - interval '14 days'
 GROUP BY 1
 ORDER BY 1 DESC;
```

Threshold: `> 0` → DB infra alert. Should be unreachable in steady state.

### (7) `PERSONA_INVALID` count

**Source:** Sentry — issues with `event.tags.event = persona_invalid`.

No SQL query (rejection branch — no `analysis_runs` row written). The
production alert rule is documented in
[`sentry-alerts.md`](./sentry-alerts.md). Threshold: `> 0` → page.

### (8) p50 / p95 latency

```sql
SELECT date_trunc('day', created_at) AS day,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY latency_ms)::int AS p50_ms,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::int AS p95_ms
  FROM analysis_runs
 WHERE latency_ms IS NOT NULL
   AND created_at >= now() - interval '14 days'
 GROUP BY 1
 ORDER BY 1 DESC;
```

Threshold: `p95_ms > 60000` → consider async/streaming post-Tier 1.

### (9) Cost/day

```sql
SELECT date_trunc('day', created_at)            AS day,
       round(sum(cost_usd_micros)::numeric / 1e6, 4) AS usd
  FROM analysis_runs
 WHERE cost_usd_micros IS NOT NULL
   AND created_at >= now() - interval '14 days'
 GROUP BY 1
 ORDER BY 1 DESC;
```

Threshold: budget-driven, set per product call. Default tripwire: 2× prior
day's value.

### (10) `RATE_LIMITED` 429 count by scope

**Source:** logs — grep on `event=analysis.rejected code=RATE_LIMITED`.

In Vercel / log sink:

```
event="analysis.rejected" AND code="RATE_LIMITED" | stats count by scope
```

Threshold: spike on any scope → either abuse pattern (investigate `user_id`)
or limits set too low (tune `lib/rate-limits.ts`).

---

## Where to look first when an alert fires

| Alert | First place to look | Next step |
|-------|---------------------|-----------|
| `PERSONA_INVALID` Sentry message | [`sentry-alerts.md`](./sentry-alerts.md) playbook | Hot-fix via admin UI or direct SQL — recompute `content_hash`. |
| High `GROUNDING_FAIL` rate (KPI #4) | `analysis_runs.diagnostics` for failure mode in last hour | If many distinct contracts: tune `MIN_SIMILARITY` in `lib/grounding.ts`. If concentrated on one persona: review the persona's output schema fields. |
| High `MODEL_ERROR` rate (KPI #5) | Groq status page + `GROQ_API_KEY` rotation history | If provider is up: rotate the key, check for org-wide rate-limit suspension. |
| `OUTPUT_SCHEMA_FAIL` (KPI #3) | One failing row's `diagnostics` detail | Likely provider drift (model deprecation) or prompt-injection bypass. Lock model pin in `lib/prompt/model-config.ts`; harden scrub list. |
| `PUBLISH_ERROR` (KPI #6) | Supabase health dashboard | DB contention — check `analysis_runs_one_current_per_contract` index health and concurrent-publish frequency. |
| `cron.invariants.drift` Sentry warning | Sentry `extra.rows` for the violating contract IDs | Run `select * from check_current_run_invariants();` in Supabase to confirm. If `multiple_current` rows present: investigate index drop. If `pointer_missing_or_mismatch`: check failed publish transactions in `analysis_runs` from the last week. |
| `RATE_LIMITED` spike (KPI #10) | Log grep by `user_id` and `tenant_id` | Concentrated on one tenant → abuse. Spread evenly → limits too low; tune `lib/rate-limits.ts`. |

---

## Daily check (first 2 weeks, < 10 minutes)

1. **Success rate ≥ 95%** today (KPI #2).
2. **No `PERSONA_INVALID` events** in Sentry for the last 24h (KPI #7).
3. **No `PUBLISH_ERROR` events** (KPI #6).
4. **`GROUNDING_FAIL` rate ≤ 5%** (KPI #4) — if creeping up, schedule a
   threshold tuning task before week 2.
5. **Cost/day vs yesterday** (KPI #9) — flag if > 2× prior day.

---

## QStash schedule setup — invariants cron

The `/api/cron/invariants` route (P7.3) is QStash-signed but the schedule is
**not** in code. Configure once via the QStash dashboard:

1. Sign in to https://console.upstash.com → QStash.
2. **Schedules → Create schedule:**
   - **Destination URL:** `https://<prod-host>/api/cron/invariants`
   - **Cron expression:** `0 12 * * 1` (Mondays 12:00 UTC)
   - **Method:** `POST`
   - **Body:** `{}`
   - **Retry:** default (3 attempts).
3. Confirm `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` are
   present in the prod Vercel env (same keys already used by `/api/cron/reap`).
4. **Optional but recommended:** create a Healthchecks.io check for this
   schedule and set `HEALTHCHECKS_INVARIANTS_PING_URL` in prod env. A missed
   weekly ping → Healthchecks alert.
5. **Verify:** trigger the schedule manually from the QStash UI once; expect
   `{ drift_count: 0, rows: null }` JSON response and a green Healthchecks
   ping (if configured). If `drift_count > 0`: a Sentry warning fires; see
   the `cron.invariants.drift` row in the decision tree above.
