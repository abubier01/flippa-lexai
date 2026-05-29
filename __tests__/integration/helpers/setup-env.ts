// Loads .env.test.local for vitest integration runs so INT_SUPABASE_* are
// available without per-shell exports. Referenced from vitest.int.config.ts.

import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const candidates = ['.env.test.local', '.env.test']
for (const file of candidates) {
  const abs = resolve(process.cwd(), file)
  if (existsSync(abs)) {
    config({ path: abs, override: false })
  }
}
