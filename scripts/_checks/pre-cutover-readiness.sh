#!/usr/bin/env bash
# pre-cutover-readiness.sh
#
# Pre-flight audit for the Tier 1 modular analysis cutover.
# This does NOT mutate data; it only validates prerequisites and environment.
#
# Required env:
#   DATABASE_URL   psql-connectable URL for the target database
#
# Optional env:
#   PROD_URL       deployed app URL (e.g. https://lexai.example.com)
#   EXPECTED_SHA   expected deployed commit SHA (compared to /api/health)

set -u
set -o pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL is required" >&2
  exit 2
fi

FAILS=0
WARNS=0

pass() { echo "✅ $1"; }
fail() { echo "❌ $1"; FAILS=$((FAILS + 1)); }
warn() { echo "⚠️  $1"; WARNS=$((WARNS + 1)); }

echo "──────────────────────────────────────────────────────────────"
echo "Tier 1 pre-cutover readiness audit"
echo "  DATABASE_URL: ${DATABASE_URL%%\?*}"
echo "  PROD_URL:     ${PROD_URL:-<unset>}"
echo "  EXPECTED_SHA: ${EXPECTED_SHA:-<unset>}"
echo "──────────────────────────────────────────────────────────────"

echo
echo "[1/8] Bootstrap admin exists in auth.users"
ADMIN_EXISTS=$(psql "$DATABASE_URL" -tA -c "
  select count(*) from auth.users
   where id = '8a652f73-1f2d-407b-bf18-32a3ddd1b979';
" 2>/dev/null | tr -d '[:space:]')
if [[ "$ADMIN_EXISTS" == "1" ]]; then
  pass "bootstrap admin UUID exists in auth.users"
else
  fail "bootstrap admin UUID missing in auth.users"
fi

echo
echo "[2/8] Legacy table precondition (contract_analyses row count)"
LEGACY_ROWS=$(psql "$DATABASE_URL" -tA -c "select count(*) from public.contract_analyses;" 2>/dev/null | tr -d '[:space:]')
if [[ -n "$LEGACY_ROWS" ]]; then
  if [[ "$LEGACY_ROWS" == "0" ]]; then
    pass "contract_analyses row count is 0"
  else
    warn "contract_analyses row count is $LEGACY_ROWS (runbook expects 0 before cutover)"
  fi
else
  fail "could not read contract_analyses row count"
fi

echo
echo "[3/8] Drop dependency gate (contract_analyses deps must be zero)"
DEP_ROWS=$(psql "$DATABASE_URL" -tA -f scripts/_checks/contract_analyses_deps.sql 2>/dev/null | grep -v '^$' | wc -l | tr -d ' ')
if [[ "$DEP_ROWS" == "0" ]]; then
  pass "no contract_analyses dependencies"
else
  fail "found $DEP_ROWS dependencies referencing contract_analyses"
  psql "$DATABASE_URL" -f scripts/_checks/contract_analyses_deps.sql || true
fi

echo
echo "[4/8] Required migration/check artifacts present"
MISSING=0
for f in \
  scripts/016_persona_and_analysis_runs.sql \
  scripts/017_admin_rpcs.sql \
  scripts/018_aggregation_rpcs_v2.sql \
  scripts/019_invariants_rpc.sql \
  scripts/_checks/post-deploy-verify.sh \
  scripts/_checks/contract_analyses_deps.sql; do
  if [[ ! -f "$f" ]]; then
    echo "   missing: $f"
    MISSING=1
  fi
done
if [[ "$MISSING" -eq 0 ]]; then
  pass "all required artifacts found"
else
  fail "one or more required artifacts are missing"
fi

echo
echo "[5/8] post-deploy verifier is executable"
if [[ -x "scripts/_checks/post-deploy-verify.sh" ]]; then
  pass "post-deploy-verify.sh is executable"
else
  warn "post-deploy-verify.sh is not executable (run: chmod +x scripts/_checks/post-deploy-verify.sh)"
fi

echo
echo "[6/8] PROD /api/health SHA check (optional)"
if [[ -z "${PROD_URL:-}" ]]; then
  warn "PROD_URL not set; skipping deployed SHA check"
else
  PROD_URL="${PROD_URL%/}"
  HEALTH_BODY=$(curl -fsS --max-time 10 "$PROD_URL/api/health" 2>/dev/null || echo "")
  if [[ -z "$HEALTH_BODY" ]]; then
    fail "/api/health did not respond from PROD_URL"
  else
    HEALTH_SHA=$(printf '%s' "$HEALTH_BODY" | sed -nE 's/.*"sha":[[:space:]]*"([^"]+)".*/\1/p')
    if [[ -z "$HEALTH_SHA" ]]; then
      fail "/api/health returned no sha"
    elif [[ -n "${EXPECTED_SHA:-}" ]]; then
      if [[ "$HEALTH_SHA" == "$EXPECTED_SHA"* || "$EXPECTED_SHA" == "$HEALTH_SHA"* ]]; then
        pass "/api/health sha=$HEALTH_SHA matches EXPECTED_SHA"
      else
        fail "/api/health sha mismatch (got $HEALTH_SHA, expected $EXPECTED_SHA)"
      fi
    else
      pass "/api/health sha=$HEALTH_SHA (no EXPECTED_SHA provided)"
    fi
  fi
fi

echo
echo "[7/8] Vercel CLI/env check (optional)"
if command -v vercel >/dev/null 2>&1; then
  ENV_LIST=$(vercel env ls production 2>/dev/null || true)
  if [[ -z "$ENV_LIST" ]]; then
    warn "vercel env ls production returned no output"
  else
    for key in GIT_SHA ANALYSIS_ENABLED GROQ_API_KEY; do
      if printf '%s' "$ENV_LIST" | grep -q "$key"; then
        pass "vercel production env includes $key"
      else
        warn "vercel production env missing $key"
      fi
    done
  fi
else
  warn "vercel CLI not installed; skipping Vercel env checks"
fi

echo
echo "[8/8] Analyze route flag-off response contract (static check)"
if rg -n "status: 'unavailable'|reason: 'analysis_disabled'" app/api/contracts/analyze/route.ts >/dev/null; then
  pass "analyze route includes analysis_disabled 503 response"
else
  fail "analyze route is missing analysis_disabled 503 response contract"
fi

echo
echo "──────────────────────────────────────────────────────────────"
echo "Summary: fails=$FAILS warns=$WARNS"
if [[ "$FAILS" -eq 0 ]]; then
  echo "✅ Pre-cutover readiness checks passed (warnings may remain)."
  exit 0
else
  echo "❌ Pre-cutover readiness checks failed."
  exit 1
fi

