'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ContractDeleteButton from './contract-delete-button'

interface Props {
  contractId: string
}

export default function ContractRowActions({ contractId }: Props) {
  const router = useRouter()

  return (
    <div className="flex items-center justify-end gap-1">
      <ContractDeleteButton
        contractId={contractId}
        variant="ghost"
        onDeleted={() => router.refresh()}
      />
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/contracts/${contractId}`}>
          <ArrowRight className="w-4 h-4" />
          <span className="sr-only">View</span>
        </Link>
      </Button>
    </div>
  )
}
