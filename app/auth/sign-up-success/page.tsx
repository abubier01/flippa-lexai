import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { MailCheck, Scale } from 'lucide-react'

export default function SignUpSuccessPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Scale className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground text-lg">LexAI</span>
        </Link>

        <div className="w-16 h-16 rounded-2xl bg-accent border border-primary/20 flex items-center justify-center mx-auto mb-6">
          <MailCheck className="w-8 h-8 text-primary" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-3">Check your email</h1>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          We sent you a confirmation link. Click it to activate your account and start analyzing contracts.
        </p>

        <Button variant="outline" asChild className="w-full">
          <Link href="/auth/login">Back to sign in</Link>
        </Button>
      </div>
    </div>
  )
}
