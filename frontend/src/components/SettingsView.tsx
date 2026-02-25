import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Archive, Download, Key, CheckCircle, AlertTriangle, Plus, Trash2, RefreshCw } from 'lucide-react'
import { fetchBackups, createBackup, downloadAll, downloadArea, fetchAppConfig, saveAppConfig } from '../api'
import type { AppSettings, CustomArea, AppConfig } from '../types'

interface Props {
  settings: AppSettings
  onChange: (s: AppSettings) => void
}

function LangDescriptions({
  appConfig,
  onSave,
}: {
  appConfig: AppConfig | undefined
  onSave: (descs: Record<string, string>) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    appConfig?.lang_descriptions_custom ?? {}
  )
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  const [saved, setSaved] = useState(false)

  const merged = (appConfig?.lang_descriptions ?? {}) as Record<string, string>

  const handleSave = () => {
    onSave(drafts)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleAdd = () => {
    if (!newKey.trim()) return
    const updated = { ...drafts, [newKey.trim()]: newVal.trim() }
    setDrafts(updated)
    setNewKey('')
    setNewVal('')
  }

  const handleRemove = (lang: string) => {
    const updated = { ...drafts }
    delete updated[lang]
    setDrafts(updated)
  }

  if (!appConfig) return <p className="text-xs text-gray-400">Loading…</p>

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {Object.entries(merged).map(([lang, desc]) => {
          const isCustom = lang in drafts
          const isDefault = !(lang in (appConfig.lang_descriptions_custom ?? {}))
          return (
            <div key={lang} className="flex items-center gap-2 text-xs">
              <span className={`font-mono w-32 flex-shrink-0 px-1.5 py-0.5 rounded ${
                isDefault ? 'bg-gray-100 text-gray-500' : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>{lang}</span>
              <input
                className="input flex-1 text-xs py-0.5"
                value={isCustom ? drafts[lang] : desc}
                placeholder={desc}
                onChange={e => setDrafts(prev => ({ ...prev, [lang]: e.target.value }))}
              />
              {!isDefault && (
                <button onClick={() => handleRemove(lang)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                  <Trash2 size={11} />
                </button>
              )}
              {isDefault && <span className="text-gray-300 text-xs flex-shrink-0 w-4" />}
            </div>
          )
        })}
      </div>

      {/* Add new custom lang */}
      <div className="flex gap-2 items-center border-t border-gray-100 pt-2">
        <input
          className="input w-28 text-xs py-0.5 font-mono"
          placeholder="lang code"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
        />
        <input
          className="input flex-1 text-xs py-0.5"
          placeholder="description for AI"
          value={newVal}
          onChange={e => setNewVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn-secondary text-xs py-0.5 px-2" onClick={handleAdd} disabled={!newKey.trim()}>
          <Plus size={11} /> Add
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button className="btn-primary text-xs py-1" onClick={handleSave}>Save Descriptions</button>
        {saved && <span className="text-green-600 text-xs">Saved!</span>}
        <span className="text-gray-400 text-xs ml-auto">Blue = custom override · Gray = built-in default</span>
      </div>
    </div>
  )
}

export default function SettingsView({ settings, onChange }: Props) {
  const qc = useQueryClient()
  const [backupMsg, setBackupMsg] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [newArea, setNewArea] = useState<Partial<CustomArea>>({ format: 'json' })
  const [showAddArea, setShowAddArea] = useState(false)

  const { data: backups = [], refetch: refetchBackups } = useQuery({
    queryKey: ['backups'],
    queryFn: fetchBackups,
  })

  const { data: appConfig, refetch: refetchConfig } = useQuery({
    queryKey: ['app-config'],
    queryFn: fetchAppConfig,
  })

  const saveConfigMutation = useMutation({
    mutationFn: saveAppConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-config'] })
      refetchConfig()
    },
  })

  const handleSaveApiKey = async () => {
    await saveConfigMutation.mutateAsync({ b_api_key: apiKeyInput })
    setApiKeySaved(true)
    setApiKeyInput('')
    setTimeout(() => setApiKeySaved(false), 3000)
  }

  const handleBackup = async () => {
    try {
      const res = await createBackup()
      setBackupMsg(`Created: ${res.backup}`)
      refetchBackups()
      setTimeout(() => setBackupMsg(''), 5000)
    } catch {
      setBackupMsg('Backup failed!')
    }
  }

  const handleAddArea = () => {
    if (!newArea.id || !newArea.name || !newArea.path) return
    const current = appConfig?.custom_areas ?? []
    saveConfigMutation.mutate({
      custom_areas: [...current, newArea as CustomArea],
    })
    setNewArea({ format: 'json' })
    setShowAddArea(false)
  }

  const handleRemoveArea = (id: string) => {
    const current = appConfig?.custom_areas ?? []
    saveConfigMutation.mutate({ custom_areas: current.filter(a => a.id !== id) })
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto">
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Settings size={16} className="text-gray-600" />
        <h2 className="font-semibold text-gray-900">Settings</h2>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-2xl">

        {/* Reference language */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-3">Reference Language</h3>
          <p className="text-xs text-gray-500 mb-3">
            Used as source for AI translation suggestions and quality checks.
          </p>
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-700 w-32">Reference language:</label>
            <input
              className="input w-40 text-sm"
              value={settings.referenceLang}
              onChange={e => onChange({ ...settings, referenceLang: e.target.value })}
              placeholder="e.g. de"
            />
          </div>
        </section>

        {/* B-API Key */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
            <Key size={14} /> B-API Key (AI Translation)
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Model: <code className="bg-gray-100 px-1 rounded">gpt-4.1-mini</code>.
            The environment variable <code className="bg-gray-100 px-1 rounded">B_API_KEY</code> always takes precedence over the stored key.
          </p>

          {/* Current status */}
          {appConfig && (
            <div className={`flex items-center gap-2 text-xs mb-3 px-3 py-2 rounded border ${
              appConfig.b_api_key_set
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-600'
            }`}>
              {appConfig.b_api_key_set
                ? <CheckCircle size={13} />
                : <AlertTriangle size={13} />}
              {appConfig.b_api_key_set
                ? `API key configured (source: ${appConfig.b_api_key_source})`
                : 'No API key configured — AI features disabled'}
            </div>
          )}

          {appConfig?.b_api_key_source === 'env' ? (
            <p className="text-xs text-gray-500 italic">
              Key is set via environment variable and cannot be overridden here.
            </p>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">Enter API key:</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  className="input flex-1 text-sm font-mono"
                  placeholder={appConfig?.b_api_key_set ? '••••••••••••••••' : 'sk-...'}
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveApiKey()}
                />
                <button
                  className="btn-primary text-sm px-3"
                  onClick={handleSaveApiKey}
                  disabled={!apiKeyInput.trim() || saveConfigMutation.isPending}
                >
                  {saveConfigMutation.isPending ? <RefreshCw size={13} className="animate-spin" /> : 'Save'}
                </button>
                {appConfig?.b_api_key_set && (
                  <button
                    className="btn-ghost text-xs text-red-500 px-2"
                    onClick={() => saveConfigMutation.mutate({ b_api_key: '' })}
                    title="Clear stored key"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              {apiKeySaved && <p className="text-green-600 text-xs">Key saved!</p>}
            </div>
          )}
        </section>

        {/* Custom Areas */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-1">Custom Translation Areas</h3>
          <p className="text-xs text-gray-500 mb-3">
            Add additional JSON or .properties areas from the data directory. They will appear in the sidebar.
          </p>

          {(appConfig?.custom_areas ?? []).length > 0 && (
            <div className="space-y-2 mb-3">
              {appConfig!.custom_areas.map(area => (
                <div key={area.id} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded border border-gray-200 text-xs">
                  <span className="font-semibold text-gray-700 w-24 truncate">{area.name}</span>
                  <span className="text-gray-400">{area.format}</span>
                  <span className="text-gray-400 font-mono flex-1 truncate">{area.path}</span>
                  <button onClick={() => handleRemoveArea(area.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showAddArea ? (
            <div className="space-y-2 bg-gray-50 p-3 rounded border border-gray-200">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600 mb-0.5 block">ID (unique slug)</label>
                  <input className="input text-xs py-1 w-full" placeholder="my-area" value={newArea.id ?? ''}
                    onChange={e => setNewArea(p => ({ ...p, id: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-0.5 block">Display name</label>
                  <input className="input text-xs py-1 w-full" placeholder="My Area" value={newArea.name ?? ''}
                    onChange={e => setNewArea(p => ({ ...p, name: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600 mb-0.5 block">Format</label>
                  <select className="input text-xs py-1 w-full" value={newArea.format}
                    onChange={e => setNewArea(p => ({ ...p, format: e.target.value as 'json' | 'properties' }))}>
                    <option value="json">JSON</option>
                    <option value="properties">.properties</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-0.5 block">Path (relative to data/1.0.0/)</label>
                  <input className="input text-xs py-1 w-full" placeholder="json/mydir" value={newArea.path ?? ''}
                    onChange={e => setNewArea(p => ({ ...p, path: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary text-xs py-1" onClick={handleAddArea}
                  disabled={!newArea.id || !newArea.name || !newArea.path}>
                  <Plus size={11} /> Add Area
                </button>
                <button className="btn-ghost text-xs py-1" onClick={() => setShowAddArea(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn-secondary text-xs py-1" onClick={() => setShowAddArea(true)}>
              <Plus size={12} /> Add Custom Area
            </button>
          )}
        </section>

        {/* Language Descriptions */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-1">Language Descriptions (for AI)</h3>
          <p className="text-xs text-gray-500 mb-3">
            These descriptions are passed to the AI so it understands language variants like <code className="bg-gray-100 px-1 rounded">de-informal</code>.
            Defaults are pre-filled; only custom overrides are saved.
          </p>
          <LangDescriptions appConfig={appConfig} onSave={(descs: Record<string, string>) => saveConfigMutation.mutate({ lang_descriptions: descs })} />
        </section>

        {/* Backup */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Archive size={15} /> Backup
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Stored in <code className="bg-gray-100 px-1 rounded">backups/</code>. Last 10 kept automatically.
          </p>
          <button onClick={handleBackup} className="btn-primary text-sm">
            <Archive size={14} /> Create Backup Now
          </button>
          {backupMsg && <p className="mt-2 text-xs text-green-600">{backupMsg}</p>}

          {backups.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Recent Backups</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {(backups as string[]).map((b: string) => (
                  <div key={b} className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-3 py-1.5 rounded border border-gray-100">
                    <Archive size={11} className="text-gray-400" />
                    <span className="font-mono flex-1">{b}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Download */}
        <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Download size={15} /> Download
          </h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => downloadArea('json')} className="btn-secondary text-sm">
              <Download size={13} /> JSON
            </button>
            <button onClick={() => downloadArea('mail')} className="btn-secondary text-sm">
              <Download size={13} /> Mail Templates
            </button>
            <button onClick={() => downloadArea('mds')} className="btn-secondary text-sm">
              <Download size={13} /> Metadatasets
            </button>
            <button onClick={downloadAll} className="btn-primary text-sm">
              <Download size={13} /> Download All
            </button>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-2">About</h3>
          <div className="text-xs text-gray-500 space-y-1">
            <p>i18n Translator – edu-sharing translation management</p>
            <p>Backend: FastAPI (Python) · Frontend: React + Vite + TailwindCSS</p>
            <p>Data: <code className="bg-gray-100 px-1 rounded">data/1.0.0/</code></p>
          </div>
        </section>
      </div>
    </div>
  )
}
