'use client'

// Client button: POST /api/admin/personas/[id]/draft, redirect to editor.
// Handles 409 (draft already exists) by toasting and refreshing.

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function CreateDraftButton({ personaId }: { personaId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/personas/${personaId}/draft`, {
          method: 'POST',
        })
        if (res.status === 409) {
          toast.message('Draft already exists', {
            description: 'Continuing to existing draft.',
          })
          router.refresh()
          router.push(`/admin/personas/${personaId}/draft`)
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          toast.error('Failed to create draft', {
            description: body.error ?? `HTTP ${res.status}`,
          })
          return
        }
        router.push(`/admin/personas/${personaId}/draft`)
      } catch (err) {
        toast.error('Failed to create draft', {
          description: (err as Error).message,
        })
      }
    })
  }

  return (
    <Button onClick={handleClick} disabled={pending}>
      {pending ? 'Creating draft…' : 'Create draft to edit'}
    </Button>
  )
}
