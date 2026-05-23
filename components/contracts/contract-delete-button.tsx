'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface Props {
  contractId: string
  /** Called after a successful delete so the parent can navigate or refresh. */
  onDeleted: () => void
  /**
   * Controls the visual style of the trigger button.
   *   - 'ghost'       — icon-only ghost button; for list-page rows.
   *   - 'outline'     — labeled outline button with destructive colour; for the
   *                     detail-page header.
   */
  variant?: 'ghost' | 'outline'
}

export default function ContractDeleteButton({ contractId, onDeleted, variant = 'ghost' }: Props) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/contracts/${contractId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? 'Failed to delete contract')
        return
      }
      toast.success('Contract deleted')
      onDeleted()
    } catch {
      toast.error('Failed to delete contract')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {variant === 'outline' ? (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            disabled={deleting}
          >
            <Trash2 className="w-4 h-4 mr-1.5" />
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={deleting} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="w-4 h-4" />
            <span className="sr-only">Delete contract</span>
          </Button>
        )}
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete contract?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the contract and all chat history. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
