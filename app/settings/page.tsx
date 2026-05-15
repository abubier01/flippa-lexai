'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { User, Lock, CreditCard, Loader2, Shield, Bell, Check, Zap, RefreshCw } from 'lucide-react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { PLAN_LIMITS, type PlanType } from '@/lib/plan-limits'
import { PRODUCTS } from '@/lib/products'

export default function SettingsPage() {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [fullName, setFullName] = useState('')
  const [saving, setSaving] = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [currentPlan, setCurrentPlan] = useState<PlanType>('free')
  const [contractsUsed, setContractsUsed] = useState(0)
  const [syncSessionId, setSyncSessionId] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setUser(data.user)
        setFullName(data.user.user_metadata?.full_name || '')
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan, contracts_this_month')
          .eq('id', data.user.id)
          .single()
        if (profile) {
          setCurrentPlan((profile.plan || 'free') as PlanType)
          setContractsUsed(profile.contracts_this_month || 0)
        }
      }
    })
  }, [])

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.updateUser({ data: { full_name: fullName } })
    if (!authError) {
      await supabase.from('profiles').update({ full_name: fullName }).eq('id', user!.id)
    }
    setSaving(false)
    if (authError) {
      toast.error(authError.message)
    } else {
      toast.success('Profile updated successfully')
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pwNew !== pwConfirm) { toast.error('New passwords do not match'); return }
    if (pwNew.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setPwLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: pwNew })
    setPwLoading(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Password updated successfully')
      setPwCurrent('')
      setPwNew('')
      setPwConfirm('')
    }
  }

  async function handleSyncPlan(e: React.FormEvent) {
    e.preventDefault()
    if (!syncSessionId.trim()) { toast.error('Enter your Stripe session ID'); return }
    setSyncing(true)
    const res = await fetch('/api/stripe/sync-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: syncSessionId.trim() }),
    })
    const data = await res.json()
    setSyncing(false)
    if (!res.ok) { toast.error(data.error || 'Failed to sync plan'); return }
    setCurrentPlan(data.plan as PlanType)
    setSyncSessionId('')
    toast.success(`Plan updated to ${data.plan}! Refresh the page to see changes.`)
  }

  const notificationSettings = [
    { label: 'Analysis complete', description: 'Get notified when contract analysis finishes', enabled: true },
    { label: 'High risk detected', description: 'Alert when a high-risk contract is found', enabled: true },
    { label: 'Weekly summary', description: 'Weekly digest of your contract activity', enabled: false },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-20 md:pb-0">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Settings</h2>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your account preferences and security</p>
      </div>

      {/* Profile */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Profile</h3>
            <p className="text-xs text-muted-foreground">Your personal information</p>
          </div>
        </div>
        <form onSubmit={handleSaveProfile} className="p-6 space-y-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={user?.email || ''}
              disabled
              className="bg-secondary/50 text-muted-foreground cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">Email cannot be changed here. Contact support if needed.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Plan</Label>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-primary border border-primary/20">
                <Shield className="w-3 h-3" />
                {PLAN_LIMITS[currentPlan]?.name || 'Free'} Plan
              </span>
              <span className="text-xs text-muted-foreground">
                {currentPlan === 'free' ? `${contractsUsed}/5 analyses used this month` : 'Unlimited analyses'}
              </span>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>

      {/* Security */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Lock className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Security</h3>
            <p className="text-xs text-muted-foreground">Update your password</p>
          </div>
        </div>
        <form onSubmit={handleChangePassword} className="p-6 space-y-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pwNew">New password</Label>
            <Input
              id="pwNew"
              type="password"
              placeholder="Min. 8 characters"
              value={pwNew}
              onChange={e => setPwNew(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pwConfirm">Confirm new password</Label>
            <Input
              id="pwConfirm"
              type="password"
              placeholder="Repeat new password"
              value={pwConfirm}
              onChange={e => setPwConfirm(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pwLoading}>
              {pwLoading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Updating…</> : 'Update password'}
            </Button>
          </div>
        </form>
      </div>

      {/* Notifications */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Bell className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Notifications</h3>
            <p className="text-xs text-muted-foreground">Configure your notification preferences</p>
          </div>
        </div>
        <div className="p-6 divide-y divide-border">
          {notificationSettings.map((setting, i) => (
            <div key={i} className={`flex items-center justify-between py-4 first:pt-0 last:pb-0`}>
              <div>
                <p className="text-sm font-medium text-foreground">{setting.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{setting.description}</p>
              </div>
              <button
                type="button"
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  setting.enabled ? 'bg-primary' : 'bg-muted'
                }`}
                aria-label={setting.label}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  setting.enabled ? 'translate-x-4' : 'translate-x-1'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Billing */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Billing & Plan</h3>
            <p className="text-xs text-muted-foreground">Manage your subscription</p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {/* Current plan banner */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-accent/60 border border-primary/20">
            <div>
              <p className="font-semibold text-foreground text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Current plan: {PLAN_LIMITS[currentPlan]?.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentPlan === 'free' && `${contractsUsed} of 5 contract analyses used this month`}
                {currentPlan === 'pro' && 'Unlimited contract analyses · Unlimited AI chat'}
                {currentPlan === 'team' && 'Unlimited everything · Up to 10 team members'}
              </p>
            </div>
            {currentPlan === 'free' ? (
              <span className="text-sm font-bold text-muted-foreground">$0/mo</span>
            ) : (
              <span className="text-sm font-bold text-foreground">
                {(() => {
                  const p = PRODUCTS.find(x => x.plan === currentPlan)
                  return p ? `$${(p.priceInCents / 100).toFixed(0)}/mo` : ''
                })()}
              </span>
            )}
          </div>

          {/* Restore plan from Stripe session */}
          <details className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1.5 select-none list-none">
              <RefreshCw className="w-3 h-3" />
              Payment went through but plan not updated? Restore it here.
            </summary>
            <form onSubmit={handleSyncPlan} className="mt-3 flex gap-2">
              <Input
                placeholder="Stripe session ID (cs_...)"
                value={syncSessionId}
                onChange={e => setSyncSessionId(e.target.value)}
                className="text-xs h-8"
              />
              <Button type="submit" size="sm" variant="outline" disabled={syncing} className="shrink-0">
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Restore'}
              </Button>
            </form>
          </details>

          {/* Plan cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PRODUCTS.map(product => {
              const isCurrentPlan = currentPlan === product.plan
              const isDowngrade =
                (currentPlan === 'team' && product.plan === 'pro') ||
                (currentPlan === 'pro' && product.plan === 'pro') ||
                (currentPlan === 'team' && product.plan === 'team')
              const price = (product.priceInCents / 100).toFixed(0)
              const features = product.plan === 'pro'
                ? ['Unlimited analyses', 'Unlimited AI chat', 'Clause extraction', 'Export PDF']
                : ['Everything in Pro', 'Up to 10 members', 'Shared library', 'SSO & SAML']

              return (
                <div
                  key={product.id}
                  className={`rounded-xl border p-5 flex flex-col gap-4 ${
                    isCurrentPlan
                      ? 'border-primary/40 bg-accent/40'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-foreground text-sm">{product.name}</p>
                      <p className="text-xl font-bold text-foreground mt-0.5">
                        ${price}<span className="text-xs font-normal text-muted-foreground">/mo</span>
                      </p>
                    </div>
                    {isCurrentPlan && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                        Current
                      </span>
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {isCurrentPlan ? (
                    <Button size="sm" variant="outline" disabled className="w-full">
                      Current plan
                    </Button>
                  ) : isDowngrade ? (
                    <Button size="sm" variant="outline" disabled className="w-full text-muted-foreground">
                      Already included
                    </Button>
                  ) : (
                    <Button asChild size="sm" className="w-full">
                      <Link href={`/upgrade?plan=${product.plan}`}>
                        <Zap className="w-3.5 h-3.5 mr-1.5" />
                        Upgrade to {product.name}
                      </Link>
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-card rounded-xl border border-destructive/30 overflow-hidden">
        <div className="px-6 py-4 border-b border-destructive/20 bg-destructive/5">
          <h3 className="font-semibold text-destructive text-sm">Danger Zone</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Irreversible and destructive actions</p>
        </div>
        <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Delete account</p>
            <p className="text-xs text-muted-foreground mt-0.5">Permanently delete your account and all contract data</p>
          </div>
          <Button variant="destructive" size="sm">Delete account</Button>
        </div>
      </div>
    </div>
  )
}
