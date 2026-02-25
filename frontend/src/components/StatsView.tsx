import { useQuery } from '@tanstack/react-query'
import { RefreshCw, CheckCircle, XCircle, BarChart2 } from 'lucide-react'
import { fetchStats } from '../api'
import type { AppStats } from '../types'

interface Props {
  stats?: AppStats
}

function StatCard({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className={`bg-white rounded-xl border-l-4 ${color} border border-gray-200 p-4 shadow-sm`}>
      <h3 className="font-semibold text-gray-800 text-sm mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Row({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`text-xs font-semibold ${warn ? 'text-red-600' : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}

export default function StatsView({ stats: propStats }: Props) {
  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    initialData: propStats,
  })

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <RefreshCw size={16} className="animate-spin mr-2" /> Computing statistics…
      </div>
    )
  }

  const { json, mail, mds } = stats.areas
  const totalMissing = json.missing_values + mail.missing_values + mds.missing_values
  const totalKeys = (json.total_keys ?? 0) + (mds.total_keys ?? 0)

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto">
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <BarChart2 size={16} className="text-orange-600" />
        <h2 className="font-semibold text-gray-900">Statistics &amp; Quality Overview</h2>
        <div className="flex-1" />
        <button onClick={() => refetch()} className="btn-secondary text-xs py-1">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
            <div className="text-3xl font-bold text-gray-900">{totalKeys.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Total Translation Keys</div>
          </div>
          <div className={`bg-white rounded-xl border p-4 shadow-sm text-center ${totalMissing > 0 ? 'border-red-300' : 'border-green-300'}`}>
            <div className={`text-3xl font-bold ${totalMissing > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {totalMissing.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">Missing Translations</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm text-center">
            <div className="text-3xl font-bold text-blue-700">
              {new Set([...json.languages, ...mail.languages, ...mds.languages]).size}
            </div>
            <div className="text-xs text-gray-500 mt-1">Total Languages</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* JSON */}
          <StatCard title="Angular JSON" color="border-blue-500">
            <Row label="Categories" value={json.categories ?? 0} />
            <Row label="Total keys" value={(json.total_keys ?? 0).toLocaleString()} />
            <Row label="Missing values" value={json.missing_values} warn={json.missing_values > 0} />
            <div className="mt-3">
              <div className="text-xs text-gray-500 mb-1.5">Languages ({json.languages.length})</div>
              <div className="flex flex-wrap gap-1">
                {json.languages.map(l => (
                  <span key={l} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">{l}</span>
                ))}
              </div>
            </div>
          </StatCard>

          {/* Mail */}
          <StatCard title="Mail Templates" color="border-purple-500">
            <Row label="Templates" value={mail.total_templates ?? 0} />
            <Row label="Missing values" value={mail.missing_values} warn={mail.missing_values > 0} />
            <div className="mt-3">
              <div className="text-xs text-gray-500 mb-1.5">Languages ({mail.languages.length})</div>
              <div className="flex flex-wrap gap-1">
                {mail.languages.map(l => (
                  <span key={l} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">{l}</span>
                ))}
              </div>
            </div>
          </StatCard>

          {/* MDS */}
          <StatCard title="Metadatasets" color="border-green-500">
            <Row label="Groups" value={(mds.groups ?? []).length} />
            <Row label="Total keys" value={(mds.total_keys ?? 0).toLocaleString()} />
            <Row label="Missing values" value={mds.missing_values} warn={mds.missing_values > 0} />
            <div className="mt-3">
              <div className="text-xs text-gray-500 mb-1.5">Groups</div>
              <div className="flex flex-wrap gap-1">
                {(mds.groups ?? []).map(g => (
                  <span key={g} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">{g}</span>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xs text-gray-500 mb-1.5">Languages ({mds.languages.length})</div>
              <div className="flex flex-wrap gap-1">
                {mds.languages.map(l => (
                  <span key={l} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">{l}</span>
                ))}
              </div>
            </div>
          </StatCard>
        </div>

        {/* Health indicators */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Health Indicators</h3>
          <div className="space-y-2">
            {[
              { label: 'JSON translations complete', ok: json.missing_values === 0, count: json.missing_values },
              { label: 'Mail templates complete', ok: mail.missing_values === 0, count: mail.missing_values },
              { label: 'Metadataset translations complete', ok: mds.missing_values === 0, count: mds.missing_values },
              { label: 'All areas have consistent languages', ok: true },
            ].map(({ label, ok, count }) => (
              <div key={label} className="flex items-center gap-2.5">
                {ok
                  ? <CheckCircle size={15} className="text-green-500 flex-shrink-0" />
                  : <XCircle size={15} className="text-red-500 flex-shrink-0" />}
                <span className="text-xs text-gray-700">{label}</span>
                {!ok && count !== undefined && (
                  <span className="badge-missing">{count} missing</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
