'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

export function DeleteAccountDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPortalButton, setShowPortalButton] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      // Reset state when closing
      setPassword('')
      setConfirmText('')
      setError(null)
      setShowPortalButton(false)
    }
  }

  async function handleRedirectToPortal() {
    setPortalLoading(true)
    try {
      const portalRes = await fetch('/api/stripe/portal', { method: 'POST' })
      const { url } = await portalRes.json()
      if (url) {
        window.location.href = url
      } else {
        setError('Failed to open billing portal. Please manage your subscription manually.')
      }
    } catch {
      setError('Failed to open billing portal. Please manage your subscription manually.')
    } finally {
      setPortalLoading(false)
    }
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (confirmText !== 'DELETE') {
      setError('Please type DELETE exactly to confirm.')
      return
    }
    if (!password) {
      setError('Password is required.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmation: 'DELETE' }),
      })
      const data = await res.json()

      if (res.status === 409 && data.requiresPortal) {
        setError('You have an active subscription. Please cancel it before deleting your account.')
        setShowPortalButton(true)
        return
      }

      if (res.status === 400 && data.oauthDeferred) {
        setError(data.error)
        return
      }

      if (res.status === 401) {
        setError('Incorrect password. Please try again.')
        return
      }

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }

      // Success — sign out client side and redirect
      const supabase = createClient()
      await supabase.auth.signOut().catch(() => {})
      toast.success('Your account has been deleted.')
      router.push('/')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Delete account
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete account</DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. All your contracts, analyses, and data
              will be deleted immediately.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleDelete} className="space-y-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delete-password">Password</Label>
              <Input
                id="delete-password"
                type="password"
                placeholder="Enter your current password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delete-confirm">
                Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm
              </Label>
              <Input
                id="delete-confirm"
                placeholder="DELETE"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                disabled={loading}
                autoComplete="off"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">
                {error}
              </p>
            )}

            {showPortalButton && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={portalLoading}
                onClick={handleRedirectToPortal}
              >
                {portalLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Opening portal…
                  </>
                ) : (
                  'Manage subscription'
                )}
              </Button>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={loading || confirmText !== 'DELETE' || !password}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  'Delete my account'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
