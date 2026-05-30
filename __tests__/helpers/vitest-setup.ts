// Global vitest setup for unit tests.
// Stubs 'server-only' so any module importing it (e.g. lib/api/auth-context.ts)
// can be exercised in the node test environment without per-test boilerplate.
import { vi } from 'vitest'

vi.mock('server-only', () => ({}))
