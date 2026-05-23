import { vi } from 'vitest'

type Result<T = unknown> = { data: T | null; error: { code?: string; message: string } | null; count?: number | null }

type TerminalConfig = {
  single?: Result
  maybeSingle?: Result
  insert?: Result
  upsert?: Result
  update?: Result
  delete?: Result
  select?: Result // for terminal selects (e.g. `.select('*', { count: 'exact', head: true })`)
}

type RpcConfig = Record<string, Array<{ single: Result }> | { single: Result }>

type SetupOptions = {
  tables?: Record<string, TerminalConfig>
  rpc?: RpcConfig
  auth?: { user?: { id: string; email?: string } | null }
}

type Calls = {
  fromByTable: Record<string, number>
  inserts: Record<string, unknown[]>
  upserts: Record<string, unknown[]>
  updates: Record<string, unknown[]>
  deletes: Record<string, Array<{ filters: Array<[string, unknown]> }>>
  rpc: Array<{ name: string; args: unknown }>
}

export function createSupabaseMock(opts: SetupOptions = {}) {
  const calls: Calls = {
    fromByTable: {},
    inserts: {},
    upserts: {},
    updates: {},
    deletes: {},
    rpc: [],
  }

  const rpcQueues: Record<string, Array<{ single: Result }>> = {}
  if (opts.rpc) {
    for (const [name, val] of Object.entries(opts.rpc)) {
      rpcQueues[name] = Array.isArray(val) ? [...val] : [val]
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeChain(table: string, terminals: TerminalConfig | undefined, op: 'select' | 'mutation' = 'select'): any {
    const filters: Array<[string, unknown]> = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: vi.fn().mockImplementation(() => chain),
      eq: vi.fn().mockImplementation((col: string, val: unknown) => { filters.push([col, val]); return chain }),
      in: vi.fn().mockImplementation(() => chain),
      order: vi.fn().mockImplementation(() => chain),
      limit: vi.fn().mockImplementation(() => chain),
      single: vi.fn().mockResolvedValue(terminals?.single ?? { data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue(terminals?.maybeSingle ?? { data: null, error: null }),
      // terminal select shape — supabase lets `await client.from('x').select(...)` resolve directly
      then: (resolve: (v: Result) => void) => Promise.resolve(terminals?.select ?? { data: [], error: null, count: 0 }).then(resolve),
    }
    if (op === 'mutation') {
      chain._filters = filters
    }
    return chain
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.auth?.user ?? { id: 'user-1' } },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      calls.fromByTable[table] = (calls.fromByTable[table] ?? 0) + 1
      const t = opts.tables?.[table]
      const selectChain = makeChain(table, t, 'select')

      // Insert/upsert/update/delete return a chain whose terminal returns the configured result.
      selectChain.insert = vi.fn().mockImplementation((row: unknown) => {
        calls.inserts[table] = [...(calls.inserts[table] ?? []), row]
        const insertChain = makeChain(table, t, 'mutation')
        // For `.insert(row).select().single()` and `.insert(row)` alone
        insertChain.single = vi.fn().mockResolvedValue(t?.insert ?? { data: null, error: null })
        insertChain.then = (resolve: (v: Result) => void) =>
          Promise.resolve(t?.insert ?? { data: null, error: null }).then(resolve)
        return insertChain
      })
      selectChain.upsert = vi.fn().mockImplementation((row: unknown) => {
        calls.upserts[table] = [...(calls.upserts[table] ?? []), row]
        const c = makeChain(table, t, 'mutation')
        c.single = vi.fn().mockResolvedValue(t?.upsert ?? { data: null, error: null })
        c.then = (resolve: (v: Result) => void) =>
          Promise.resolve(t?.upsert ?? { data: null, error: null }).then(resolve)
        return c
      })
      selectChain.update = vi.fn().mockImplementation((row: unknown) => {
        calls.updates[table] = [...(calls.updates[table] ?? []), row]
        const c = makeChain(table, t, 'mutation')
        c.then = (resolve: (v: Result) => void) =>
          Promise.resolve(t?.update ?? { data: null, error: null }).then(resolve)
        return c
      })
      selectChain.delete = vi.fn().mockImplementation(() => {
        const c = makeChain(table, t, 'mutation')
        // Capture filters via eq() proxying into _filters
        c.eq = vi.fn().mockImplementation((col: string, val: unknown) => {
          c._filters.push([col, val])
          return c
        })
        c.then = (resolve: (v: Result) => void) => {
          calls.deletes[table] = [...(calls.deletes[table] ?? []), { filters: c._filters }]
          return Promise.resolve(t?.delete ?? { data: null, error: null }).then(resolve)
        }
        return c
      })

      return selectChain
    }),
    rpc: vi.fn().mockImplementation((name: string, args?: unknown) => {
      calls.rpc.push({ name, args })
      const queue = rpcQueues[name]
      // FIFO consume for the configured array; once exhausted, reuse the last
      // queued response (so a single-element queue acts like a constant). If you
      // need strict over-call detection in a future test, switch to a custom mock.
      const next = queue?.shift() ?? queue?.[queue.length - 1] ?? { single: { data: null, error: null } }
      return {
        single: vi.fn().mockResolvedValue(next.single),
        then: (resolve: (v: Result) => void) => Promise.resolve(next.single).then(resolve),
      }
    }),
  }

  return { client, calls }
}
