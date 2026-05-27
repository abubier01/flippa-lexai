import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    passWithNoTests: false,
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    exclude: ['.claude/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
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
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.d.ts',
        'app/**/*.test.{ts,tsx}',
        'lib/**/*.test.{ts,tsx}',
      ],
      thresholds: {
        lines: 94,
        branches: 80,
        functions: 92,
        statements: 91,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
