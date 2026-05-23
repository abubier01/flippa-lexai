# PAY-2 Feature Enforcement Audit

Created: 2026-05-22  
Last updated: 2026-05-23

## Status Snapshot

- PAY-2 scope is complete and remains in effect after follow-up refactors.
- Server-side feature gating is centralized in [access.ts](/Users/alexbubier/Documents/GitHub/flippa-lexai/lib/plan/access.ts) via:
  - `assertHasFeature(userId, feature)`
  - `PlanGateError` for structured 403 responses

## Enforced Server-Side (Implemented)

- `sharedLibrary` (enforced)
  - [team route](/Users/alexbubier/Documents/GitHub/flippa-lexai/app/api/team/route.ts)
  - [team invite route](/Users/alexbubier/Documents/GitHub/flippa-lexai/app/api/team/invite/route.ts)
  - [team share-contract route](/Users/alexbubier/Documents/GitHub/flippa-lexai/app/api/team/share-contract/route.ts)
  - [team members route](/Users/alexbubier/Documents/GitHub/flippa-lexai/app/api/team/members/[memberId]/route.ts)
  - [team join route](/Users/alexbubier/Documents/GitHub/flippa-lexai/app/api/team/join/route.ts)

## Validation Coverage (Implemented)

- Feature helper tests:
  - [access.test.ts](/Users/alexbubier/Documents/GitHub/flippa-lexai/lib/plan/__tests__/access.test.ts)
  - Includes grant/deny checks and grace-window behavior (`past_due` in-grace vs expired).
- Route-level enforcement tests:
  - [feature-gates.test.ts](/Users/alexbubier/Documents/GitHub/flippa-lexai/app/api/team/__tests__/feature-gates.test.ts)
  - [route.test.ts](/Users/alexbubier/Documents/GitHub/flippa-lexai/app/api/team/__tests__/route.test.ts)

## N3 Cleanup Status

- PAY-2 requirement "avoid `profile.plan`-based API entitlement decisions" is complete for the touched API surfaces.
- Entitlement checks in those routes now resolve through `getActivePlan`/`assertHasFeature` rather than trusting profile cache values.

## Additional Feature Endpoints (Completed)

- `exportPdf` (enforced)
  - [reports export route](/Users/alexbubier/Documents/GitHub/flippa-lexai/app/api/reports/export/route.ts)
  - Gate: `assertHasFeature(userId, 'exportPdf')`

- `sso` (enforced)
  - [sso config route](/Users/alexbubier/Documents/GitHub/flippa-lexai/app/api/sso/config/route.ts)
  - Gate: `assertHasFeature(userId, 'sso')`
  - Current behavior for authorized callers: returns `501` placeholder until full SSO implementation lands.

- `clauseExtraction` (enforced)
  - [contract clauses route](/Users/alexbubier/Documents/GitHub/flippa-lexai/app/api/contracts/[id]/clauses/route.ts)
  - Gate: `assertHasFeature(userId, 'clauseExtraction')`

- `advancedRiskBreakdown` (enforced)
  - [contract risk-breakdown route](/Users/alexbubier/Documents/GitHub/flippa-lexai/app/api/contracts/[id]/risk-breakdown/route.ts)
  - Gate: `assertHasFeature(userId, 'advancedRiskBreakdown')`

## Open TODO Count

- 0 open PAY-2 feature-enforcement TODO items remain.

## Latest Validation Check

Run date: 2026-05-23

- `npm run test -- app/api/__tests__/feature-endpoints.test.ts`
  - Result: pass (`1` file, `5` tests)
- `npm run typecheck`
  - Result: pass
