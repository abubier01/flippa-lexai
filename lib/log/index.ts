type Level = 'debug' | 'info' | 'warn' | 'error'
type LogContext = Record<string, unknown>

function serializeContext(ctx?: LogContext): LogContext | undefined {
  if (!ctx || !(ctx.err instanceof Error)) return ctx
  return {
    ...ctx,
    err: { message: ctx.err.message, stack: ctx.err.stack, name: ctx.err.name },
  }
}

// Field-name substrings redacted to '[REDACTED]' before serialization.
// Case-insensitive; matched anywhere in the key. Extend with care — over-broad
// substrings (e.g. 'id') would mask debugging info.
const REDACT_SUBSTRINGS = [
  'password', 'token', 'secret', 'apikey', 'api_key',
  'authorization', 'cookie', 'sessionid',
]

function shouldRedactKey(key: string): boolean {
  const lower = key.toLowerCase()
  return REDACT_SUBSTRINGS.some(s => lower.includes(s))
}

function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    return value.map(v => redact(v, seen))
  }
  if (value && typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]'
    seen.add(value as object)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = shouldRedactKey(k) ? '[REDACTED]' : redact(v, seen)
    }
    return out
  }
  return value
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(value, (_k, v) => {
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return '[Circular]'
      seen.add(v)
    }
    return v
  })
}

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function thresholdLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase()
  return LEVEL_ORDER[raw as Level] ?? LEVEL_ORDER.info
}

function emit(level: Level, msg: string, ctx?: LogContext) {
  if (LEVEL_ORDER[level] < thresholdLevel()) return
  const serialized = serializeContext(ctx)
  const safeCtx = serialized ? (redact(serialized) as LogContext) : undefined
  const entry = { level, msg, ts: new Date().toISOString(), ...safeCtx }
  const line = safeStringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

type Logger = {
  debug: (msg: string, ctx?: LogContext) => void
  info: (msg: string, ctx?: LogContext) => void
  warn: (msg: string, ctx?: LogContext) => void
  error: (msg: string, ctx?: LogContext) => void
  child: (base: LogContext) => Logger
}

function build(base: LogContext = {}): Logger {
  const withBase = (ctx?: LogContext) => ({ ...base, ...ctx })
  return {
    debug: (msg, ctx) => emit('debug', msg, withBase(ctx)),
    info: (msg, ctx) => emit('info', msg, withBase(ctx)),
    warn: (msg, ctx) => emit('warn', msg, withBase(ctx)),
    error: (msg, ctx) => emit('error', msg, withBase(ctx)),
    child: (next) => build(withBase(next)),
  }
}

export const log = build()
