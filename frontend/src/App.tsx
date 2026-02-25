import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Code2, Mail, Database, BarChart2, Settings, Download, Archive, FolderOpen, Plus, X, ChevronRight } from 'lucide-react'
import { fetchStats, createBackup, downloadAll, fetchAppConfig, saveAppConfig } from './api'
import type { AreaId, AppSettings, CustomArea } from './types'
import JsonView from './components/JsonView'
import MailView from './components/MailView'
import MdsView from './components/MdsView'
import StatsView from './components/StatsView'
import SettingsView from './components/SettingsView'
import { Tooltip } from './components/Tooltip'

type View = AreaId | 'stats' | 'settings' | string

const STATIC_NAV = [
  {
    id: 'json' as View, label: 'Angular JSON', icon: Code2, color: 'text-blue-600',
    tooltip: 'i18n JSON files for the Angular frontend (src/assets/i18n)',
  },
  {
    id: 'mail' as View, label: 'Mail Templates', icon: Mail, color: 'text-purple-600',
    tooltip: 'Multilingual mail templates (XML format)',
  },
  {
    id: 'mds' as View, label: 'Metadatasets', icon: Database, color: 'text-green-600',
    tooltip: 'Metadataset value-space translations (.properties files)',
  },
]

const BOTTOM_NAV = [
  { id: 'stats' as View, label: 'Statistics', icon: BarChart2, color: 'text-orange-600', tooltip: 'Translation coverage & quality overview' },
  { id: 'settings' as View, label: 'Settings', icon: Settings, color: 'text-gray-600', tooltip: 'API key, reference language, custom areas, language descriptions' },
]

const DEFAULT_SETTINGS: AppSettings = {
  referenceLang: 'de',
  visibleLangs: { json: [], mail: [], mds: [] },
}

const EMPTY_AREA: Partial<CustomArea> = { format: 'json' }

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function App() {
  const qc = useQueryClient()
  const [view, setView] = useState<View>('json')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [backupMsg, setBackupMsg] = useState('')
  const [showAddArea, setShowAddArea] = useState(false)
  const [newArea, setNewArea] = useState<Partial<CustomArea>>(EMPTY_AREA)

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
  })

  const { data: appConfig } = useQuery({
    queryKey: ['app-config'],
    queryFn: fetchAppConfig,
  })

  const customAreas = appConfig?.custom_areas ?? []

  const addAreaMutation = useMutation({
    mutationFn: (area: CustomArea) => {
      const updated = [...customAreas, area]
      return saveAppConfig({ custom_areas: updated })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-config'] })
      setShowAddArea(false)
      setNewArea(EMPTY_AREA)
    },
  })

  const handleBackup = async () => {
    try {
      const res = await createBackup()
      setBackupMsg(`Backup: ${res.backup}`)
      setTimeout(() => setBackupMsg(''), 4000)
    } catch {
      setBackupMsg('Backup failed')
    }
  }

  const handleAddArea = () => {
    if (!newArea.name?.trim() || !newArea.path?.trim()) return
    const id = newArea.id?.trim() || slugify(newArea.name)
    addAreaMutation.mutate({
      id,
      name: newArea.name.trim(),
      format: newArea.format ?? 'json',
      path: newArea.path.trim(),
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="w-52 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-gray-200">
          <h1 className="font-bold text-gray-900 text-base leading-tight">i18n Translator</h1>
          <p className="text-xs text-gray-500 mt-0.5">edu-sharing</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {/* Static areas */}
          <div className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Areas</div>

          {STATIC_NAV.map(({ id, label, icon: Icon, color, tooltip }) => {
            const areaStats = stats?.areas[id as AreaId]
            const missing = areaStats ? areaStats.missing_values : 0
            return (
              <Tooltip key={id} text={tooltip} side="right" className="w-full">
                <button
                  onClick={() => setView(id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
                    view === id
                      ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={15} className={view === id ? 'text-blue-600' : color} />
                  <span className="flex-1">{label}</span>
                  {missing > 0 && (
                    <Tooltip text={`${missing} missing translation${missing !== 1 ? 's' : ''}`} side="right">
                      <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium cursor-default">
                        {missing > 999 ? '999+' : missing}
                      </span>
                    </Tooltip>
                  )}
                </button>
              </Tooltip>
            )
          })}

          {/* Custom areas */}
          {customAreas.length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Custom</span>
              </div>
              {customAreas.map(area => (
                <Tooltip key={area.id} text={`Path: ${area.path} · Format: ${area.format}`} side="right" className="w-full">
                  <button
                    onClick={() => setView(`custom:${area.id}`)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
                      view === `custom:${area.id}`
                        ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <FolderOpen size={15} className={view === `custom:${area.id}` ? 'text-blue-600' : 'text-gray-500'} />
                    <span className="flex-1 truncate">{area.name}</span>
                    <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                  </button>
                </Tooltip>
              ))}
            </>
          )}

          {/* Inline add area */}
          {showAddArea ? (
            <div className="mx-3 mt-2 mb-1 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-600">New Area</span>
                <button onClick={() => { setShowAddArea(false); setNewArea(EMPTY_AREA) }} className="text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              </div>
              <input
                className="input w-full text-xs py-1"
                placeholder="Name (e.g. Config Override)"
                value={newArea.name ?? ''}
                onChange={e => setNewArea(p => ({ ...p, name: e.target.value, id: slugify(e.target.value) }))}
                autoFocus
              />
              <input
                className="input w-full text-xs py-1 font-mono"
                placeholder="Relative path (e.g. config/i18n)"
                value={newArea.path ?? ''}
                onChange={e => setNewArea(p => ({ ...p, path: e.target.value }))}
              />
              <div className="flex items-center gap-2">
                <select
                  className="input flex-1 text-xs py-1"
                  value={newArea.format ?? 'json'}
                  onChange={e => setNewArea(p => ({ ...p, format: e.target.value as 'json' | 'properties' }))}
                >
                  <option value="json">JSON</option>
                  <option value="properties">.properties</option>
                </select>
                <button
                  className="btn-primary text-xs py-1 px-2 flex-shrink-0"
                  disabled={!newArea.name?.trim() || !newArea.path?.trim() || addAreaMutation.isPending}
                  onClick={handleAddArea}
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <Tooltip text="Add a custom translation area to the sidebar" side="right" className="w-full">
              <button
                onClick={() => setShowAddArea(true)}
                className="w-full flex items-center gap-2 px-4 py-2 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <Plus size={13} />
                <span>Add Area…</span>
              </button>
            </Tooltip>
          )}

          {/* Separator + bottom nav */}
          <div className="border-t border-gray-100 mt-2 pt-2">
            {BOTTOM_NAV.map(({ id, label, icon: Icon, color, tooltip }) => (
              <Tooltip key={id} text={tooltip} side="right" className="w-full">
                <button
                  onClick={() => setView(id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
                    view === id
                      ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={15} className={view === id ? 'text-blue-600' : color} />
                  <span className="flex-1">{label}</span>
                </button>
              </Tooltip>
            ))}
          </div>
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-gray-200 p-3 space-y-1.5">
          <Tooltip text="Save a timestamped backup of all translation files to /backups" side="right" className="w-full">
            <button
              onClick={handleBackup}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              <Archive size={13} />
              Create Backup
            </button>
          </Tooltip>
          <Tooltip text="Download all translation areas as a ZIP archive" side="right" className="w-full">
            <button
              onClick={downloadAll}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              <Download size={13} />
              Download All
            </button>
          </Tooltip>
          {backupMsg && (
            <p className="text-xs text-green-600 px-1">{backupMsg}</p>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {view === 'json' && (
          <JsonView settings={settings} onStatsChange={() => refetchStats()} />
        )}
        {view === 'mail' && (
          <MailView settings={settings} onStatsChange={() => refetchStats()} />
        )}
        {view === 'mds' && (
          <MdsView settings={settings} onStatsChange={() => refetchStats()} />
        )}
        {view === 'stats' && <StatsView stats={stats} />}
        {view === 'settings' && (
          <SettingsView settings={settings} onChange={setSettings} />
        )}
      </main>
    </div>
  )
}
