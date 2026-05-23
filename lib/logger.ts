import { inspect } from 'node:util'

type Level = 'info' | 'warn' | 'error'
type LogFields = Record<string, unknown>

const SENSITIVE_KEY_RE = /email|password|card|cvv|secret|token|raw_body|body/i
const MAX_DEPTH = 4

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (!isObjectLike(value)) return value
  if (depth >= MAX_DEPTH) return '[Truncated]'
  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1, seen))
  }

  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out[key] = '[REDACTED]'
    } else {
      out[key] = redactValue(child, depth + 1, seen)
    }
  }
  return out
}

function redactFields(fields: LogFields): LogFields {
  return redactValue(fields, 0, new WeakSet<object>()) as LogFields
}

function extractStripeRequestId(fields: LogFields): string | undefined {
  const err = fields.err
  if (!isObjectLike(err)) return undefined
  const requestId = (err as { requestId?: unknown }).requestId
  if (typeof requestId !== 'string' || requestId.length === 0) return undefined
  return requestId
}

function colorFor(level: Level): string {
  if (level === 'info') return '\x1b[36m'
  if (level === 'warn') return '\x1b[33m'
  return '\x1b[31m'
}

function output(level: Level, line: string) {
  if (level === 'error') {
    console.error(line)
    return
  }
  if (level === 'warn') {
    console.warn(line)
    return
  }
  console.log(line)
}

function emit(level: Level, scope: string, msg: string, fields: LogFields = {}) {
  const redacted = redactFields(fields)
  const requestId = extractStripeRequestId(fields)
  const ts = new Date().toISOString()

  if (process.env.NODE_ENV === 'production') {
    const payload: Record<string, unknown> = {
      ts,
      level,
      scope,
      msg,
      fields: redacted,
    }
    if (requestId) payload.requestId = requestId
    output(level, JSON.stringify(payload))
    return
  }

  const levelColor = colorFor(level)
  const reset = '\x1b[0m'
  const head = `${levelColor}${level.toUpperCase()}${reset}`
  const suffix = Object.keys(redacted).length > 0 ? ` ${inspect(redacted, { colors: true, depth: MAX_DEPTH })}` : ''
  const reqPart = requestId ? ` requestId=${requestId}` : ''
  output(level, `[${ts}] ${head} [${scope}] ${msg}${reqPart}${suffix}`)
}

export const log = {
  info(scope: string, message: string, fields?: LogFields) {
    emit('info', scope, message, fields)
  },
  warn(scope: string, message: string, fields?: LogFields) {
    emit('warn', scope, message, fields)
  },
  error(scope: string, message: string, fields?: LogFields) {
    emit('error', scope, message, fields)
  },
}
