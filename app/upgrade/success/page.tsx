import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2, XCircle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

const PLAN_NAMES: Record<string, string> = {
  pro: 'Pro',
  team: 'Team',
}

export default async function UpgradeSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; status?: string }>
}) {
  const params = await searchParams
  const isError = params.status === 'error'
  const plan = params.plan
  const planName = plan ? PLAN_NAMES[plan] : null

  if (!isError && !planName) redirect('/settings')

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <XCircle className="w-8 h-8 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Payment verification failed</h1>
            <p className="text-muted-foreground text-sm mt-2">
              We could not verify your payment. If you were charged, please contact support and we&apos;ll resolve it immediately.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild>
              <Link href="/settings">Back to Settings</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Welcome to LexAI {planName}!
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            Your payment was successful and your account has been upgraded. You now have access to all {planName} features.
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5 text-left space-y-2">
          {plan === 'pro' && (
            <>
              <p className="text-sm font-medium text-foreground">Your Pro benefits are now active:</p>
              <ul className="text-sm text-muted-foreground space-y-1.5 mt-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />Unlimited contract analyses</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />Unlimited AI chat per contract</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />Advanced risk breakdown & clause extraction</li>
              </ul>
            </>
          )}
          {plan === 'team' && (
            <>
              <p className="text-sm font-medium text-foreground">Your Team benefits are now active:</p>
              <ul className="text-sm text-muted-foreground space-y-1.5 mt-2">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />Everything in Pro</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />Shared contract library for your team</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />SSO & SAML + dedicated account manager</li>
              </ul>
            </>
          )}
        </div>
        <Button asChild className="w-full">
          <Link href="/dashboard">
            Go to Dashboard
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
