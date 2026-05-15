'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { BarChart3, FileText, AlertTriangle, TrendingUp } from 'lucide-react'

interface Props {
  total: number
  completed: number
  avgRisk: number
  highRisk: number
  riskDistribution: { name: string; value: number; fill: string }[]
  monthlyData: { month: string; count: number }[]
  riskBuckets: { range: string; count: number }[]
}

export default function ReportsCharts({
  total, completed, avgRisk, highRisk,
  riskDistribution, monthlyData, riskBuckets,
}: Props) {
  const stats = [
    { label: 'Total Contracts', value: total, icon: FileText, color: 'text-primary', bg: 'bg-accent' },
    { label: 'Analyzed', value: completed, icon: BarChart3, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Avg Risk Score', value: `${avgRisk}/100`, icon: TrendingUp, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'High Risk', value: highRisk, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  ]

  const hasData = total > 0

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Reports</h2>
        <p className="text-muted-foreground text-sm mt-0.5">Analytics and insights across all your contracts</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card rounded-xl border border-border p-5">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4.5 h-4.5 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {!hasData ? (
        <div className="bg-card rounded-xl border border-border p-16 text-center">
          <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
          <p className="font-medium text-foreground mb-1">No data yet</p>
          <p className="text-sm text-muted-foreground">Upload and analyze contracts to see reports here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly uploads */}
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="font-semibold text-foreground mb-1">Contracts Uploaded</h3>
            <p className="text-xs text-muted-foreground mb-5">Monthly volume</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} barSize={28}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'none' }}
                  cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                />
                <Bar dataKey="count" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} name="Contracts" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Risk distribution pie */}
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="font-semibold text-foreground mb-1">Risk Distribution</h3>
            <p className="text-xs text-muted-foreground mb-5">By severity level</p>
            {riskDistribution.every(d => d.value === 0) ? (
              <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                No risk data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={riskDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                  >
                    {riskDistribution.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'none' }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Risk score buckets */}
          <div className="bg-card rounded-xl border border-border p-6 lg:col-span-2">
            <h3 className="font-semibold text-foreground mb-1">Risk Score Distribution</h3>
            <p className="text-xs text-muted-foreground mb-5">Number of contracts by score range</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={riskBuckets} barSize={40}>
                <XAxis dataKey="range" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'none' }}
                  cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Contracts">
                  {riskBuckets.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={i < 2 ? 'var(--color-chart-2)' : i < 3 ? 'var(--color-chart-3)' : 'var(--color-chart-4)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
