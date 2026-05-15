import { notFound } from 'next/navigation'
import { DEMO_CONTRACTS, DEMO_ANALYSES, DEMO_MESSAGES } from '@/lib/demo-data'
import DemoContractView from '@/components/demo/demo-contract-view'

export default async function DemoContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contract = DEMO_CONTRACTS.find(c => c.id === id)
  if (!contract || contract.status !== 'completed') notFound()

  const analysis = DEMO_ANALYSES[id] ?? null
  const messages = DEMO_MESSAGES[id] ?? []

  return <DemoContractView contract={contract} analysis={analysis} initialMessages={messages} />
}
