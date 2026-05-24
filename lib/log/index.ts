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

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = shouldRedactKey(k) ? '[REDACTED]' : redact(v)
    }
    return out
  }
  return value
}

function emit(level: Level, msg: string, ctx?: LogContext) {
  const safeCtx = ctx ? (redact(ctx) as LogContext) : undefined
  const entry = { level, msg, ts: new Date().toISOString(), ...safeCtx }
  const line = JSON.stringify(entry)
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
    error: (msg, ctx) => emit('error', msg, serializeContext(withBase(ctx))),
    child: (next) => build(withBase(next)),
  }
}

export const log = build()
