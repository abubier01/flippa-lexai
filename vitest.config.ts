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
        'app/api/contracts/**/route.ts',
        'lib/llm/schemas.ts',
        'lib/plan/access-logic.ts',
        'lib/stripe/idempotency-key.ts',
        'lib/stripe/price-to-plan.ts',
        'lib/risk-scoring.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.d.ts',
        'app/**/*.test.{ts,tsx}',
        'lib/**/*.test.{ts,tsx}',
      ],
      thresholds: {
        lines: 87,
        branches: 70,
        functions: 74,
        statements: 84,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
