'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Scale, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'Contains a number', pass: /\d/.test(password) },
    { label: 'Contains a letter', pass: /[a-zA-Z]/.test(password) },
  ]
  const passed = checks.filter(c => c.pass).length
  const color = passed === 0 ? 'bg-border' : passed === 1 ? 'bg-destructive' : passed === 2 ? 'bg-yellow-400' : 'bg-emerald-500'

  if (!password) return null

  return (
    <div className="space-y-2 mt-1">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i < passed ? color : 'bg-border'}`}
          />
        ))}
      </div>
      <ul className="space-y-1">
        {checks.map(c => (
          <li key={c.label} className={`text-xs flex items-center gap-1.5 ${c.pass ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.pass ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [sessionError, setSessionError] = useState(false)

  useEffect(() => {
    // Supabase sends the user back with a hash fragment containing the tokens.
    // The client SDK picks it up automatically via onAuthStateChange.
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })

    // Give it a moment — if no PASSWORD_RECOVERY event fires, the link is invalid/expired
    const timeout = setTimeout(() => {
      setSessionError(prev => !prev && !sessionReady ? true : prev)
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      toast.error('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Password updated! Signing you in…')
    router.push('/dashboard')
    router.refresh()
  }

  const mismatch = confirm.length > 0 && password !== confirm

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:flex-1 bg-foreground flex-col justify-between p-12">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Scale className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-background text-lg">LexAI</span>
        </Link>

        <div className="space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-background leading-tight">
            Choose a strong password.
          </h2>
          <p className="text-background/60 text-sm leading-relaxed max-w-xs">
            Use at least 8 characters with a mix of letters and numbers. You&apos;ll be signed in automatically once you save it.
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

          {sessionError && !sessionReady ? (
            /* Invalid / expired link state */
            <div className="flex flex-col items-center text-center gap-5">
              <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-destructive" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground mb-2">Link expired</h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  This password reset link has expired or already been used. Request a new one and try again.
                </p>
              </div>
              <Link href="/auth/forgot-password" className="w-full">
                <Button className="w-full">Request a new link</Button>
              </Link>
              <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Back to sign in
              </Link>
            </div>
          ) : (
            /* Reset form */
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground mb-1">Set a new password</h1>
                <p className="text-muted-foreground text-sm">
                  {sessionReady
                    ? 'Your identity is verified. Choose a new password below.'
                    : 'Verifying your reset link…'}
                </p>
              </div>

              <form onSubmit={handleReset} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoFocus
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <PasswordStrength password={password} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <div className="relative">
                    <Input
                      id="confirm"
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Repeat your password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      required
                      autoComplete="new-password"
                      className={`pr-10 ${mismatch ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {mismatch && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Passwords do not match
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-10"
                  disabled={loading || !sessionReady || !password || mismatch}
                >
                  {loading ? 'Saving…' : 'Save new password'}
                </Button>
              </form>

              <Link href="/auth/login" className="mt-6 flex items-center justify-center text-sm text-muted-foreground hover:text-foreground transition-colors">
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
