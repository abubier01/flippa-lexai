#!/usr/bin/env bash
# post-deploy-verify.sh — 7-check production smoke suite.
#
# Referenced by docs/plans/2026-05-27-tier1-modular-analysis-plan.md § F
# (Deployment & Cutover Runbook), step 4. Run AFTER deploy lands but
# BEFORE flipping ANALYSIS_ENABLED=true.
#
# Required env:
#   DATABASE_URL   psql-connectable URL for the prod database
#   PROD_URL       https://lexai.example.com (no trailing slash)
#
# Optional env:
#   EXPECTED_SHA   git SHA of the just-deployed commit. If set, check #6
#                  asserts /api/health returns this sha. If unset, check #6
#                  just verifies /api/health responds with *some* sha.
#
# Idempotent — safe to re-run as many times as needed.
# Exits 0 only if every check passes. First failure prints ❌ but the
# script continues so you see the full picture; final exit code is the
# count of failures (or 1 if any failed).

set -u
set -o pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL is required" >&2
  exit 2
fi
if [[ -z "${PROD_URL:-}" ]]; then
  echo "❌ PROD_URL is required (e.g. https://lexai.example.com)" >&2
  exit 2
fi

PROD_URL="${PROD_URL%/}"   # strip trailing slash

FAILS=0
declare -a RESULTS=()

pass() { RESULTS+=("✅ $1"); echo "✅ $1"; }
fail() { RESULTS+=("❌ $1"); echo "❌ $1"; FAILS=$((FAILS+1)); }

echo "──────────────────────────────────────────────────────────────"
echo "Tier 1 post-deploy verification"
echo "  DATABASE_URL: ${DATABASE_URL%%\?*}"
echo "  PROD_URL:     $PROD_URL"
echo "  EXPECTED_SHA: ${EXPECTED_SHA:-<unset; will not match-check>}"
echo "──────────────────────────────────────────────────────────────"

# ── Check 1: persona v1 exists and is current ────────────────────
echo
echo "[1/7] Persona procurement v1 is current"
PERSONA_V=$(psql "$DATABASE_URL" -tA -c "
  select coalesce(v.version_number::text, '')
  from personas p
  left join persona_versions v on v.id = p.current_version_id
  where p.id = 'procurement';
" 2>/dev/null | tr -d '[:space:]')
if [[ "$PERSONA_V" == "1" ]]; then
  pass "personas.current_version_id → version_number = 1"
else
  fail "expected version_number=1, got '${PERSONA_V:-<no row>}'"
fi

# ── Check 2: persona hash matches expectation ────────────────────
echo
echo "[2/7] Persona v1 content_hash matches scripts/_seed/persona-v1-hash.ts"
DB_HASH=$(psql "$DATABASE_URL" -tA -c "
  select content_hash from persona_versions
   where persona_id='procurement' and version_number=1;
" 2>/dev/null | tr -d '[:space:]')
# Script prints the hash on a line after the literal '---- sha256 hex ----'
# marker. Grab the next non-empty line.
SCRIPT_OUTPUT=$(pnpm tsx scripts/_seed/persona-v1-hash.ts 2>/dev/null || echo "")
EXPECTED_HASH=$(printf '%s\n' "$SCRIPT_OUTPUT" \
  | awk '/---- sha256 hex ----/{getline; print; exit}' \
  | tr -d '[:space:]')
if [[ -z "$EXPECTED_HASH" ]]; then
  fail "could not parse expected hash from persona-v1-hash.ts output"
elif [[ "$DB_HASH" == "$EXPECTED_HASH" ]]; then
  pass "content_hash = $DB_HASH"
else
  fail "DB hash '$DB_HASH' != expected '$EXPECTED_HASH'"
fi

# ── Check 3: contract_analyses table gone ────────────────────────
echo
echo "[3/7] Legacy contract_analyses table is dropped"
REG=$(psql "$DATABASE_URL" -tA -c "select coalesce(to_regclass('public.contract_analyses')::text, '');" 2>/dev/null | tr -d '[:space:]')
if [[ -z "$REG" ]]; then
  pass "to_regclass('public.contract_analyses') is NULL"
else
  fail "contract_analyses still exists: $REG"
fi

# ── Check 4: RLS policies present ────────────────────────────────
echo
echo "[4/7] RLS policies present on analysis_runs, personas, persona_versions"
POL_COUNT=$(psql "$DATABASE_URL" -tA -c "
  select count(*) from pg_policies
   where tablename in ('analysis_runs','personas','persona_versions');
" 2>/dev/null | tr -d '[:space:]')
if [[ "$POL_COUNT" == "4" ]]; then
  pass "4 policies across the three tables"
else
  fail "expected 4 policies, got '$POL_COUNT'"
  psql "$DATABASE_URL" -c "select tablename, policyname, cmd from pg_policies where tablename in ('analysis_runs','personas','persona_versions') order by tablename, policyname;" || true
fi

# ── Check 5: server-write-only on analysis_runs ──────────────────
echo
echo "[5/7] analysis_runs is server-write-only (no user writes)"
NON_SELECT=$(psql "$DATABASE_URL" -tA -c "
  select count(*) from pg_policies
   where tablename='analysis_runs' and cmd<>'SELECT';
" 2>/dev/null | tr -d '[:space:]')
WRITE_GRANTS=$(psql "$DATABASE_URL" -tA -c "
  select count(*) from information_schema.role_table_grants
   where table_name='analysis_runs'
     and privilege_type in ('INSERT','UPDATE','DELETE')
     and grantee not in ('service_role','postgres');
" 2>/dev/null | tr -d '[:space:]')
if [[ "$NON_SELECT" == "0" && "$WRITE_GRANTS" == "0" ]]; then
  pass "0 non-SELECT policies, 0 user-role write grants"
else
  fail "non-SELECT policies=$NON_SELECT, user-role write grants=$WRITE_GRANTS"
fi

# ── Check 6: GIT_SHA propagated to deployed bundle ───────────────
echo
echo "[6/7] GIT_SHA propagated via /api/health"
HEALTH_BODY=$(curl -fsS --max-time 10 "$PROD_URL/api/health" 2>/dev/null || echo "")
if [[ -z "$HEALTH_BODY" ]]; then
  fail "/api/health did not respond (network or 5xx)"
else
  # crude jq-free sha extraction: matches "sha":"<hex-or-null>"
  HEALTH_SHA=$(printf '%s' "$HEALTH_BODY" \
    | sed -nE 's/.*"sha":[[:space:]]*"([^"]+)".*/\1/p')
  if [[ -z "$HEALTH_SHA" ]]; then
    fail "/api/health returned no sha (body: $HEALTH_BODY)"
  elif [[ -n "${EXPECTED_SHA:-}" ]]; then
    if [[ "$HEALTH_SHA" == "$EXPECTED_SHA"* || "$EXPECTED_SHA" == "$HEALTH_SHA"* ]]; then
      pass "/api/health sha=$HEALTH_SHA matches EXPECTED_SHA"
    else
      fail "sha mismatch: deployed=$HEALTH_SHA expected=$EXPECTED_SHA"
    fi
  else
    pass "/api/health sha=$HEALTH_SHA (no EXPECTED_SHA provided; not match-checked)"
  fi
fi

# ── Check 7: admin route rejects unauthenticated requests ────────
echo
echo "[7/7] /api/admin/personas requires auth (expect 401)"
STATUS=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$PROD_URL/api/admin/personas" 2>/dev/null || echo "000")
if [[ "$STATUS" == "401" ]]; then
  pass "GET /api/admin/personas → 401"
else
  fail "expected 401, got $STATUS"
fi

# ── Summary ──────────────────────────────────────────────────────
echo
echo "──────────────────────────────────────────────────────────────"
echo "Summary:"
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo "──────────────────────────────────────────────────────────────"
if [[ "$FAILS" -eq 0 ]]; then
  echo "🎉 All 7 checks passed. Safe to set ANALYSIS_ENABLED=true."
  exit 0
else
  echo "❌ $FAILS check(s) failed. Do NOT flip ANALYSIS_ENABLED=true."
  exit 1
fi
