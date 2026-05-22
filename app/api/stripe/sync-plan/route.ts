import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated. Plan changes are processed automatically by Stripe webhooks. If your plan looks wrong, refresh the page or contact support.',
    },
    { status: 410 },
  )
}
