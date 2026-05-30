import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    include: ['**/*.int.test.ts'],
    passWithNoTests: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    fileParallelism: false,
    coverage: { enabled: false },
    setupFiles: ['./__tests__/integration/helpers/setup-env.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
