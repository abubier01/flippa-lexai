import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { log } from '@/lib/log'

export function logger(req: NextRequest, route: string) {
  const requestId = req.headers.get('x-vercel-id') ?? randomUUID()
  return log.child({ requestId, route })
}
