import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Filter, Plus, Download, RefreshCw, Eye, EyeOff, Wand2, ArrowUpDown, AlertTriangle } from 'lucide-react'
import { fetchMdsGroups, fetchMdsGroup, saveMdsGroup, addMdsLanguage, downloadArea, aiFillEmpty } from '../api'
import type { AppSettings, SortOrder } from '../types'
import TranslationTable from './TranslationTable'
import AiFillPanel from './AiFillPanel'
import { Tooltip } from './Tooltip'

interface Props {
  settings: AppSettings
  onStatsChange: () => void
}

export default function MdsView({ settings, onStatsChange }: Props) {
  const qc = useQueryClient()
  const [group, setGroup] = useState<string>('')
  const [filter, setFilter] = useState('')
  const [showMissingOnly, setShowMissingOnly] = useState(false)
  const [hiddenLangs, setHiddenLangs] = useState<string[]>([])
  const [newLang, setNewLang] = useState('')
  const [newLangDesc, setNewLangDesc] = useState('')
  const [showAddLang, setShowAddLang] = useState(false)
  const [sortOrder, setSortOrder] = useState<SortOrder>('file')
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [showErrorsOnly, setShowErrorsOnly] = useState(false)
  const [fillingLang, setFillingLang] = useState<string | null>(null)
  const [fillError, setFillError] = useState('')

  const { data: groups = {} } = useQuery({
    queryKey: ['mds-groups'],
    queryFn: fetchMdsGroups,
  })

  useEffect(() => {
    if (!group) {
      const first = Object.keys(groups)[0]
      if (first) setGroup(first)
    }
  }, [groups, group])

  const { data: groupData, isLoading } = useQuery({
    queryKey: ['mds-group', group, sortOrder],
    queryFn: () => fetchMdsGroup(group, sortOrder),
    enabled: !!group,
  })

  const saveMutation = useMutation({
    mutationFn: ({ lang, translations }: { lang: string; translations: Record<string, string> }) =>
      saveMdsGroup(group, lang, translations),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mds-group', group] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      onStatsChange()
    },
  })

  const addLangMutation = useMutation({
    mutationFn: ({ lang, description }: { lang: string; description: string }) =>
      addMdsLanguage(lang, description || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mds-groups'] })
      qc.invalidateQueries({ queryKey: ['mds-group', group] })
      qc.invalidateQueries({ queryKey: ['app-config'] })
      setNewLang('')
      setNewLangDesc('')
      setShowAddLang(false)
    },
  })

  const handleQuickFill = async (lang: string) => {
    if (!groupData || !group) return
    setFillingLang(lang)
    setFillError('')
    try {
      const result = await aiFillEmpty('mds', group, lang, settings.referenceLang)
      if (result.count > 0) {
        const currentFlat: Record<string, string> = {}
        for (const e of groupData.entries) {
          currentFlat[e.key] = e.translations[lang] ?? ''
        }
        const merged = { ...currentFlat, ...result.translations }
        saveMutation.mutate({ lang, translations: merged })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setFillError(`AI error: ${msg}`)
      setTimeout(() => setFillError(''), 6000)
    } finally {
      setFillingLang(null)
    }
  }

  const handleCellSave = (lang: string, key: string, value: string) => {
    if (!groupData) return
    const currentFlat: Record<string, string> = {}
    for (const e of groupData.entries) {
      currentFlat[e.key] = e.translations[lang] ?? ''
    }
    currentFlat[key] = value
    saveMutation.mutate({ lang, translations: currentFlat })
  }

  const visibleLangs = useMemo(() => {
    if (!groupData) return []
    return groupData.languages.filter((l: string) => !hiddenLangs.includes(l))
  }, [groupData, hiddenLangs])

  const groupNames = Object.keys(groups)

  return (
    <div className="flex h-full min-h-0">
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <h2 className="font-semibold text-gray-900 text-sm whitespace-nowrap">Metadatasets</h2>

        {/* Group selector */}
        <div className="flex items-center gap-1 flex-wrap">
          {groupNames.map(g => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                group === g ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Language toggles */}
        {groupData && (
          <div className="flex items-center gap-1">
            {groupData.languages.map((lang: string) => (
              <button
                key={lang}
                onClick={() => setHiddenLangs(prev =>
                  prev.includes(lang) ? prev.filter((l: string) => l !== lang) : [...prev, lang]
                )}
                className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                  hiddenLangs.includes(lang)
                    ? 'border-gray-200 text-gray-400 bg-gray-50'
                    : 'border-green-300 text-green-700 bg-green-50'
                }`}
              >
                {hiddenLangs.includes(lang)
                  ? <EyeOff size={10} className="inline mr-1" />
                  : <Eye size={10} className="inline mr-1" />}
                {lang}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-7 w-44 text-xs py-1"
            placeholder="Filter keys/values…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>

        <Tooltip text={showMissingOnly ? 'Show all keys (remove filter)' : 'Show only keys with missing translations'} side="bottom">
          <button
            onClick={() => { setShowMissingOnly(x => !x); setShowErrorsOnly(false) }}
            className={`btn text-xs py-1 ${showMissingOnly ? 'btn-danger' : 'btn-secondary'}`}
          >
            <Filter size={12} />
            Missing
          </button>
        </Tooltip>

        <Tooltip text={showErrorsOnly ? 'Show all keys' : 'Show only keys with template variable mismatches ({{var}} errors)'} side="bottom">
          <button
            onClick={() => { setShowErrorsOnly(x => !x); setShowMissingOnly(false) }}
            className={`btn text-xs py-1 ${showErrorsOnly ? 'bg-yellow-100 text-yellow-800 border border-yellow-400' : 'btn-secondary'}`}
          >
            <AlertTriangle size={12} />
            Errors
          </button>
        </Tooltip>

        <Tooltip text={sortOrder === 'file' ? 'Sorted by file order — click for alphabetical' : 'Sorted alphabetically — click for file order'} side="bottom">
          <button
            onClick={() => setSortOrder(s => s === 'file' ? 'alpha' : 'file')}
            className={`btn text-xs py-1 ${sortOrder === 'alpha' ? 'btn-primary' : 'btn-ghost'}`}
          >
            <ArrowUpDown size={12} />
            {sortOrder === 'alpha' ? 'A–Z' : 'File order'}
          </button>
        </Tooltip>

        <Tooltip text="Add a new language or language variant (e.g. de-informal)" side="bottom">
          <button onClick={() => setShowAddLang(x => !x)} className="btn-secondary text-xs py-1">
            <Plus size={12} /> Language
          </button>
        </Tooltip>

        <Tooltip text={showAiPanel ? 'Close AI assistant' : 'Open AI assistant: fill empty fields or review translations'} side="bottom">
          <button
            onClick={() => setShowAiPanel(x => !x)}
            className={`btn text-xs py-1 ${showAiPanel ? 'bg-green-100 text-green-700 border border-green-300' : 'btn-secondary'}`}
          >
            <Wand2 size={12} /> AI
          </button>
        </Tooltip>

        <Tooltip text="Download this area as ZIP" side="bottom">
          <button onClick={() => downloadArea('mds')} className="btn-ghost text-xs py-1">
            <Download size={12} />
          </button>
        </Tooltip>
      </div>

      {showAddLang && (
        <div className="flex-shrink-0 bg-green-50 border-b border-green-200 px-4 py-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-green-800 w-28">Language code:</span>
            <input
              className="input w-32 text-xs py-1"
              placeholder="e.g. es_ES"
              value={newLang}
              onChange={e => setNewLang(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-700 w-28">Description <span className="text-green-400">(for AI)</span>:</span>
            <input
              className="input flex-1 text-xs py-1"
              placeholder="e.g. Spanish (Spain)"
              value={newLangDesc}
              onChange={e => setNewLangDesc(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="btn text-xs py-1 bg-green-600 text-white hover:bg-green-700"
              disabled={!newLang.trim()}
              onClick={() => addLangMutation.mutate({ lang: newLang.trim(), description: newLangDesc.trim() })}
            >
              Add to all groups
            </button>
            <button className="btn-ghost text-xs py-1" onClick={() => { setShowAddLang(false); setNewLang(''); setNewLangDesc('') }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Fill Missing bar */}
      {groupData && (() => {
        const langsWithMissing = groupData.languages
          .filter(l => l !== settings.referenceLang)
          .map(l => ({ lang: l, count: groupData.entries.filter(e => !e.translations[l]?.trim()).length }))
          .filter(x => x.count > 0)
        if (!langsWithMissing.length) return null
        return (
          <div className="flex-shrink-0 bg-green-50 border-b border-green-100 px-4 py-1.5 flex items-center gap-2 flex-wrap">
            <Wand2 size={12} className="text-green-600 flex-shrink-0" />
            <span className="text-xs text-green-700 flex-shrink-0">AI fill missing:</span>
            {langsWithMissing.map(({ lang, count }) => (
              <Tooltip key={lang} text={`Auto-translate ${count} missing ${lang} field${count !== 1 ? 's' : ''} using AI — results applied directly`} side="bottom">
                <button
                  onClick={() => handleQuickFill(lang)}
                  disabled={!!fillingLang}
                  className="btn-secondary text-xs py-0.5 px-2 flex items-center gap-1"
                >
                  <Wand2 size={10} className={fillingLang === lang ? 'animate-pulse text-green-600' : ''} />
                  {fillingLang === lang ? 'Filling…' : `${lang} (${count})`}
                </button>
              </Tooltip>
            ))}
            {fillError && <span className="text-xs text-red-600">{fillError}</span>}
          </div>
        )
      })()}

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">
            <RefreshCw size={16} className="animate-spin mr-2" /> Loading {group}…
          </div>
        ) : groupData ? (
          <TranslationTable
            entries={groupData.entries}
            languages={groupData.languages}
            visibleLangs={visibleLangs}
            referenceLang={settings.referenceLang}
            filter={filter}
            showMissingOnly={showMissingOnly}
            showErrorsOnly={showErrorsOnly}
            sortOrder={sortOrder}
            onSortChange={setSortOrder}
            onSave={handleCellSave}
            isSaving={saveMutation.isPending}
          />
        ) : null}
      </div>
      </div>

      {/* AI Panel */}
      {showAiPanel && groupData && (
        <AiFillPanel
          area="mds"
          id={group}
          languages={groupData.languages}
          referenceLang={settings.referenceLang}
          entries={groupData.entries}
          queryKey={['mds-group', group, sortOrder]}
          onClose={() => setShowAiPanel(false)}
          onStatsChange={onStatsChange}
        />
      )}
    </div>
  )
}
