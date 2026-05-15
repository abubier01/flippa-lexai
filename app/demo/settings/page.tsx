import Link from 'next/link'
import { Lock, User, CreditCard, Bell, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DEMO_USER } from '@/lib/demo-data'

const SECTIONS = [
  {
    icon: User,
    title: 'Profile',
    description: 'Update your name, email address, and avatar.',
  },
  {
    icon: CreditCard,
    title: 'Billing & Plan',
    description: 'Manage your subscription, view invoices, and upgrade your plan.',
  },
  {
    icon: Bell,
    title: 'Notifications',
    description: 'Choose when and how you receive email and in-app notifications.',
  },
  {
    icon: Shield,
    title: 'Security',
    description: 'Change your password, enable two-factor authentication, and manage sessions.',
  },
]

export default function DemoSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your account preferences.</p>
      </div>

      {/* Demo profile preview */}
      <div className="bg-card rounded-xl border border-border p-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xl font-bold shrink-0">
          {DEMO_USER.full_name.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <p className="font-semibold text-foreground">{DEMO_USER.full_name}</p>
          <p className="text-sm text-muted-foreground">{DEMO_USER.email}</p>
          <span className="inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize">
            {DEMO_USER.plan} plan
          </span>
        </div>
      </div>

      {/* Locked settings sections */}
      <div className="space-y-3">
        {SECTIONS.map(({ icon: Icon, title, description }) => (
          <div key={title} className="bg-card rounded-xl border border-border p-5 flex items-center gap-4 opacity-70">
            <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <Icon className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        ))}
      </div>

      {/* Sign up CTA */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Create an account to manage settings</p>
          <p className="text-sm text-muted-foreground mt-1">
            Sign up free to set up your profile, manage billing, and configure your preferences.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button asChild>
            <Link href="/auth/sign-up">Create free account</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/auth/login">Log in</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
