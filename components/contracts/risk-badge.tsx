interface Props {
  score: number
  showLabel?: boolean
}

export default function RiskBadge({ score, showLabel = true }: Props) {
  const level = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low'
  const config = {
    high:   { label: 'High Risk',   classes: 'bg-red-100 text-red-700 border-red-200' },
    medium: { label: 'Medium Risk', classes: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    low:    { label: 'Low Risk',    classes: 'bg-green-100 text-green-700 border-green-200' },
  }[level]

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${config.classes}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        level === 'high' ? 'bg-red-500' : level === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
      }`} />
      {showLabel ? config.label : score}
    </span>
  )
}
