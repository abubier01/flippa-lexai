import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    passWithNoTests: false,
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    exclude: ['.claude/**', 'node_modules/**', '.worktrees/**', '**/*.int.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        // Existing covered surfaces
        'app/api/account/route.ts',
        'app/api/admin/migrate-blog/route.ts',
        'app/api/admin/migrate-tickets/route.ts',
        'app/api/admin/migrate/route.ts',
        'app/api/admin/seed-blog/route.ts',
        'lib/admin/sql-migrations.ts',
        'app/api/contracts/**/route.ts',
        'app/api/stripe/webhook/route.ts',
        'app/api/team/invite/route.ts',
        'lib/llm/schemas.ts',
        'lib/plan/access.ts',
        'lib/plan/access-logic.ts',
        'lib/plan-limits.ts',
        'lib/security/admin-guard.ts',
        'lib/stripe/customers.ts',
        'lib/stripe/event-deduper.ts',
        'lib/stripe/idempotency-key.ts',
        'lib/stripe/price-to-plan.ts',
        'lib/stripe/handlers/checkout-session-completed.ts',
        'lib/stripe/handlers/subscription-updated.ts',
        'lib/stripe/handlers/subscription-deleted.ts',
        'lib/stripe/handlers/invoice-payment-failed.ts',
        'lib/stripe/handlers/invoice-payment-succeeded.ts',
        'lib/risk-scoring.ts',
        // P8.5 — Tier 1 modular analysis surfaces. Floor is "block
        // regression," not "drive aspirational coverage." Adjust the
        // FLOOR threshold below before lifting the include list.
        'lib/prompt/**/*.ts',
        'lib/grounding.ts',
        'lib/rate-limits.ts',
        'lib/persona/**/*.ts',
        'lib/analysis/**/*.ts',
        'lib/contracts/read.ts',
        'lib/risk/severity.ts',
        'lib/admin/**/*.ts',
        'lib/log/rejection.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.d.ts',
        'app/**/*.test.{ts,tsx}',
        'lib/**/*.test.{ts,tsx}',
        // Pure type-only modules — no executable code to cover.
        'lib/prompt/persona-types.ts',
        'lib/prompt/output-schema.ts',
      ],
      thresholds: {
        // FLOOR (2026-05-29): floors are set just below current aggregate
        // numbers — block regression, do not drive aspirational coverage.
        // Tier 1 modules lib/analysis/repo.ts, lib/persona/repo.ts,
        // lib/contracts/read.ts, lib/admin/guard.ts are exercised by
        // integration tests (vitest.int.config.ts) which v8 unit coverage
        // does not see, so unit-only numbers understate real coverage.
        // Raise these in a follow-on PR if/when unit tests for those
        // surfaces land.
        lines: 80,
        functions: 68,
        branches: 70,
        statements: 77,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
