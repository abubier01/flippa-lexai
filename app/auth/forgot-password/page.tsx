'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Scale, Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo,
    })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — matches login/sign-up style */}
      <div className="hidden lg:flex lg:flex-1 bg-foreground flex-col justify-between p-12">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Scale className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-background text-lg">LexAI</span>
        </Link>

        <div className="space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-background leading-tight">
            Happens to the best of us.
          </h2>
          <p className="text-background/60 text-sm leading-relaxed max-w-xs">
            Enter your email and we&apos;ll send you a secure link to reset your password. The link expires in 60 minutes.
          </p>
        </div>

        <div className="text-background/40 text-sm">&copy; {new Date().getFullYear()} LexAI, Inc.</div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-12">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden mb-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Scale className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-foreground text-lg">LexAI</span>
            </Link>
          </div>

          {sent ? (
            /* Success state */
            <div className="flex flex-col items-center text-center gap-5">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground mb-2">Check your inbox</h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  We sent a password reset link to{' '}
                  <span className="font-medium text-foreground">{email}</span>.
                  It will expire in 60 minutes.
                </p>
              </div>
              <div className="w-full space-y-3 pt-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { setSent(false) }}
                >
                  Use a different email
                </Button>
                <Link href="/auth/login" className="block">
                  <Button variant="ghost" className="w-full gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Back to sign in
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                Didn&apos;t receive it? Check your spam folder or{' '}
                <button
                  onClick={handleSubmit as unknown as React.MouseEventHandler}
                  className="text-primary hover:underline"
                >
                  resend
                </button>.
              </p>
            </div>
          ) : (
            /* Email form state */
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground mb-1">Forgot your password?</h1>
                <p className="text-muted-foreground text-sm">
                  No problem. Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </div>

                <Button type="submit" className="w-full h-10" disabled={loading || !email.trim()}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </Button>
              </form>

              <Link href="/auth/login" className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
