# Deploy Checklist

Status: living doc. Update on every cutover or env-handling change.

## Pre-deploy env check — GIT_SHA

`lib/prompt/core.ts` throws at module load if `NODE_ENV=production` and
`GIT_SHA` is unset. CI (`.github/workflows/ci.yml` → `prod-build-checks`)
asserts the variable is wired before main is built, but **Vercel runs the
build in a separate environment from CI** — the variable must also be set
in the Vercel project.

- **Vercel dashboard → Project → Settings → Environment Variables**
- Key: `GIT_SHA`
- Value: `$VERCEL_GIT_COMMIT_SHA` (Vercel system variable; auto-resolved at
  build time)
- Environments: **Production** (and **Preview** if previews need accurate
  `core_version` provenance).

If absent, every analyze request in production will 500 with
`GIT_SHA is required in production` until the env var is added and the next
build promotes.

## Other pre-deploy items

- Database migrations applied: confirm latest `scripts/0NN_*.sql` is in
  prod via `psql ... \dt` or the supabase dashboard.
- `ANALYSIS_ENABLED` flag — leave unset (=enabled) for prod; toggle to
  `'false'` for a fast kill-switch via Vercel env without a redeploy
  (route reads at request time).
- Sentry DSN, Upstash Redis URL/TOKEN, Groq API key — confirmed via
  Vercel Production env.
