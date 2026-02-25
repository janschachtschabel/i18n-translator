import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Download, RefreshCw, Eye, EyeOff, ChevronDown, ChevronUp, Wand2, Filter, AlertTriangle } from 'lucide-react'
import { Tooltip } from './Tooltip'
import { fetchMail, saveMailLang, addMailLanguage, downloadArea, aiTranslate } from '../api'
import type { AppSettings } from '../types'

interface Props {
  settings: AppSettings
  onStatsChange: () => void
}

function isMissing(v: string | undefined) {
  return !v || !v.trim()
}

function getTemplateVars(s: string): string[] {
  return Array.from(s.matchAll(/\{\{[^}]+\}\}/g)).map(m => m[0])
}

export default function MailView({ settings, onStatsChange }: Props) {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('')
  const [hiddenLangs, setHiddenLangs] = useState<string[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<Record<string, Record<string, { subject?: string; message?: string }>>>({})
  const [newLang, setNewLang] = useState('')
  const [newLangDesc, setNewLangDesc] = useState('')
  const [showAddLang, setShowAddLang] = useState(false)
  const [suggesting, setSuggesting] = useState<string | null>(null)
  const [showMissingOnly, setShowMissingOnly] = useState(false)
  const [showErrorsOnly, setShowErrorsOnly] = useState(false)
  const [aiError, setAiError] = useState('')
  const [fillingLang, setFillingLang] = useState<string | null>(null)
  const [fillProgress, setFillProgress] = useState<{ done: number; total: number } | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['mail'], queryFn: fetchMail })

  const saveMutation = useMutation({
    mutationFn: ({ lang, templates }: { lang: string; templates: Record<string, { subject?: string; message?: string }> }) =>
      saveMailLang(lang, templates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mail'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      onStatsChange()
    },
  })

  const addLangMutation = useMutation({
    mutationFn: ({ lang, description }: { lang: string; description: string }) =>
      addMailLanguage(lang, description || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mail'] })
      qc.invalidateQueries({ queryKey: ['app-config'] })
      setNewLang('')
      setNewLangDesc('')
      setShowAddLang(false)
    },
  })

  if (isLoading || !data) {
    return <div className="flex items-center justify-center h-full text-gray-400"><RefreshCw size={16} className="animate-spin mr-2" /> Loading…</div>
  }

  const visibleLangs = data.languages.filter(l => !hiddenLangs.includes(l))
  const referenceLang = settings.referenceLang
  const bestRefLang = data.languages.includes(settings.referenceLang)
    ? settings.referenceLang
    : (data.languages[0] ?? '')

  const getDraft = (tmpl: string, lang: string, field: 'subject' | 'message') =>
    editing[tmpl]?.[lang]?.[field] ?? data.entries.find(e => e.name === tmpl)?.translations[lang]?.[field] ?? ''

  const setDraft = (tmpl: string, lang: string, field: 'subject' | 'message', val: string) => {
    setEditing(prev => ({
      ...prev,
      [tmpl]: { ...(prev[tmpl] ?? {}), [lang]: { ...(prev[tmpl]?.[lang] ?? {}), [field]: val } },
    }))
  }

  const entryHasVarError = (name: string) => {
    const refMsg = data.entries.find(e => e.name === name)?.translations[bestRefLang]?.message ?? ''
    const refVars = getTemplateVars(refMsg)
    if (refVars.length === 0) return false
    return visibleLangs
      .filter(l => l !== bestRefLang && !isMissing(getDraft(name, l, 'message')))
      .some(l => {
        const tv = getTemplateVars(getDraft(name, l, 'message'))
        return JSON.stringify(refVars.slice().sort()) !== JSON.stringify(tv.slice().sort())
      })
  }

  const filtered = data.entries.filter(e => {
    if (filter && !e.name.toLowerCase().includes(filter.toLowerCase())) return false
    if (showMissingOnly) {
      if (!visibleLangs.some(lang => isMissing(getDraft(e.name, lang, 'message')))) return false
    }
    if (showErrorsOnly) {
      if (!entryHasVarError(e.name)) return false
    }
    return true
  })

  const handleSave = (lang: string) => {
    const langData: Record<string, { subject?: string; message?: string }> = {}
    for (const e of data.entries) {
      const entry = e.translations[lang] ?? {}
      const draft = editing[e.name]?.[lang] ?? {}
      langData[e.name] = { ...entry, ...draft }
    }
    saveMutation.mutate({ lang, templates: langData })
  }

  const findRefSource = (
    entry: typeof data.entries[0],
    field: 'subject' | 'message',
    targetLang: string
  ): { lang: string; value: string } | null => {
    const pref = entry.translations[bestRefLang]?.[field] ?? ''
    if (pref.trim()) return { lang: bestRefLang, value: pref }
    for (const [l, t] of Object.entries(entry.translations)) {
      if (l === targetLang) continue
      const v = t?.[field] ?? ''
      if (v.trim()) return { lang: l, value: v }
    }
    return null
  }

  const handleAISuggest = async (tmplName: string, lang: string, field: 'subject' | 'message') => {
    const refEntry = data.entries.find(e => e.name === tmplName)
    if (!refEntry) return
    const src = findRefSource(refEntry, field, lang)
    if (!src) {
      setAiError(`No source text found for "${tmplName}" — cannot translate`)
      setTimeout(() => setAiError(''), 4000)
      return
    }
    setSuggesting(`${tmplName}:${lang}:${field}`)
    setAiError('')
    try {
      const res = await aiTranslate(src.value, src.lang, lang, `Mail template: ${tmplName}, field: ${field}`)
      setDraft(tmplName, lang, field, res.translation)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setAiError(`AI error: ${msg}`)
      setTimeout(() => setAiError(''), 6000)
    } finally {
      setSuggesting(null)
    }
  }

  const handleFillAllMissing = async (lang: string) => {
    const missingTasks: Array<{ entry: typeof data.entries[0]; field: 'subject' | 'message'; src: { lang: string; value: string } }> = []
    for (const entry of data.entries) {
      const hasSubject = Object.values(entry.translations).some(t => 'subject' in t)
      if (hasSubject && isMissing(getDraft(entry.name, lang, 'subject'))) {
        const src = findRefSource(entry, 'subject', lang)
        if (src) missingTasks.push({ entry, field: 'subject', src })
      }
      if (isMissing(getDraft(entry.name, lang, 'message'))) {
        const src = findRefSource(entry, 'message', lang)
        if (src) missingTasks.push({ entry, field: 'message', src })
      }
    }
    if (!missingTasks.length) return
    setFillingLang(lang)
    setFillProgress({ done: 0, total: missingTasks.length })
    setAiError('')
    let done = 0
    for (const { entry, field, src } of missingTasks) {
      try {
        const res = await aiTranslate(src.value, src.lang, lang, `Mail template: ${entry.name}, field: ${field}`)
        setDraft(entry.name, lang, field, res.translation)
      } catch {
        // continue with remaining
      }
      done++
      setFillProgress({ done, total: missingTasks.length })
    }
    setFillingLang(null)
    setFillProgress(null)
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <h2 className="font-semibold text-gray-900 text-sm">Mail Templates</h2>

        <div className="flex items-center gap-1">
          {data.languages.map(lang => (
            <button
              key={lang}
              onClick={() => setHiddenLangs(prev => prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang])}
              className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                hiddenLangs.includes(lang) ? 'border-gray-200 text-gray-400' : 'border-purple-300 text-purple-700 bg-purple-50'
              }`}
            >
              {hiddenLangs.includes(lang) ? <EyeOff size={10} className="inline mr-1" /> : <Eye size={10} className="inline mr-1" />}
              {lang}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-7 w-44 text-xs py-1" placeholder="Filter templates…" value={filter} onChange={e => setFilter(e.target.value)} />
        </div>

        <Tooltip text={showMissingOnly ? 'Show all templates (remove filter)' : 'Show only templates with missing translations'} side="bottom">
          <button
            onClick={() => { setShowMissingOnly(x => !x); setShowErrorsOnly(false) }}
            className={`btn text-xs py-1 ${showMissingOnly ? 'btn-danger' : 'btn-secondary'}`}
          >
            <Filter size={12} />
            Missing
          </button>
        </Tooltip>

        <Tooltip text={showErrorsOnly ? 'Show all templates' : 'Show only templates with {{variable}} mismatches between languages'} side="bottom">
          <button
            onClick={() => { setShowErrorsOnly(x => !x); setShowMissingOnly(false) }}
            className={`btn text-xs py-1 ${showErrorsOnly ? 'bg-yellow-100 text-yellow-800 border border-yellow-400' : 'btn-secondary'}`}
          >
            <AlertTriangle size={12} />
            Errors
          </button>
        </Tooltip>

        <Tooltip text="Add a new language or language variant (e.g. fr_FR)" side="bottom">
          <button onClick={() => setShowAddLang(x => !x)} className="btn-secondary text-xs py-1">
            <Plus size={12} /> Language
          </button>
        </Tooltip>
        <Tooltip text="Download mail templates as ZIP" side="bottom">
          <button onClick={() => downloadArea('mail')} className="btn-ghost text-xs py-1"><Download size={12} /></button>
        </Tooltip>
      </div>

      {showAddLang && (
        <div className="flex-shrink-0 bg-purple-50 border-b border-purple-200 px-4 py-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-purple-800 w-28">Language code:</span>
            <input className="input w-32 text-xs py-1" placeholder="e.g. fr_FR" value={newLang} onChange={e => setNewLang(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-purple-700 w-28">Description <span className="text-purple-400">(for AI)</span>:</span>
            <input className="input flex-1 text-xs py-1" placeholder="e.g. French (France)" value={newLangDesc} onChange={e => setNewLangDesc(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary text-xs py-1" disabled={!newLang.trim()} onClick={() => addLangMutation.mutate({ lang: newLang.trim(), description: newLangDesc.trim() })}>Add</button>
            <button className="btn-ghost text-xs py-1" onClick={() => { setShowAddLang(false); setNewLang(''); setNewLangDesc('') }}>Cancel</button>
          </div>
        </div>
      )}

      {/* AI error banner */}
      {aiError && (
        <div className="flex-shrink-0 bg-red-50 border-b border-red-200 px-4 py-1.5 flex items-center gap-2 text-xs text-red-700">
          <AlertTriangle size={12} /> {aiError}
        </div>
      )}

      {/* Save + Fill bar */}
      <div className="flex-shrink-0 bg-gray-50 border-b border-gray-200 px-4 py-1.5 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 flex-shrink-0">Per language:</span>
        {visibleLangs.filter(l => l !== bestRefLang).map(lang => {
          const missingCount = data.entries.reduce((n, e) =>
            n + (isMissing(getDraft(e.name, lang, 'message')) ? 1 : 0), 0
          )
          const isRunning = fillingLang === lang
          return (
            <span key={lang} className="inline-flex items-center gap-1">
              <Tooltip text={`Save all edited ${lang} translations`} side="bottom">
                <button onClick={() => handleSave(lang)} className="btn-primary text-xs py-0.5 px-2">
                  Save {lang}
                </button>
              </Tooltip>
              {missingCount > 0 && (
                <Tooltip text={`AI-fill ${missingCount} missing ${lang} field${missingCount !== 1 ? 's' : ''} — then review & save`} side="bottom">
                  <button
                    onClick={() => handleFillAllMissing(lang)}
                    disabled={isRunning || !!fillingLang}
                    className="btn-secondary text-xs py-0.5 px-2 flex items-center gap-1"
                  >
                    <Wand2 size={11} className={isRunning ? 'animate-pulse text-blue-500' : ''} />
                    {isRunning && fillProgress
                      ? `${fillProgress.done}/${fillProgress.total}`
                      : `Fill ${missingCount} missing`}
                  </button>
                </Tooltip>
              )}
            </span>
          )
        })}
        {visibleLangs.includes(bestRefLang) && (
          <span key={bestRefLang} className="inline-flex items-center gap-1">
            <Tooltip text={`Save all edited ${bestRefLang} translations (reference language)`} side="bottom">
              <button onClick={() => handleSave(bestRefLang)} className="btn-primary text-xs py-0.5 px-2">
                Save {bestRefLang} <span className="opacity-60 ml-0.5">(ref)</span>
              </button>
            </Tooltip>
          </span>
        )}
        {saveMutation.isPending && <span className="text-xs text-blue-600">Saving…</span>}
      </div>

      {/* Templates */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
            No templates match the current filter.
          </div>
        )}
        {(showMissingOnly || showErrorsOnly) && filtered.length > 0 && (
          <div className="text-xs text-gray-500 pb-1">
            Showing {filtered.length} of {data.entries.length} templates
          </div>
        )}
        {filtered.map(entry => {
          const isExpanded = expanded[entry.name] !== false
          const hasAnyMissing = visibleLangs.some(lang =>
            isMissing(getDraft(entry.name, lang, 'message'))
          )
          const hasVarErr = entryHasVarError(entry.name)
          const borderClass = hasVarErr ? 'border-yellow-400' : hasAnyMissing ? 'border-red-300' : 'border-gray-200'
          return (
            <div key={entry.name} className={`bg-white rounded-lg border ${borderClass} overflow-hidden`}>
              <button
                className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(prev => ({ ...prev, [entry.name]: !isExpanded }))}
              >
                <span className="font-mono text-xs font-semibold text-gray-800">{entry.name}</span>
                {hasAnyMissing && <span className="badge-missing">missing</span>}
                {hasVarErr && (
                  <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-800 border border-yellow-300 px-1.5 py-0.5 rounded-full font-medium">
                    <AlertTriangle size={10} /> var error
                  </span>
                )}
                <span className="flex-1" />
                {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 grid gap-0" style={{ gridTemplateColumns: `repeat(${visibleLangs.length}, minmax(280px, 1fr))` }}>
                  {visibleLangs.map(lang => {
                    const hasSubject = 'subject' in (entry.translations[lang] ?? {}) ||
                      Object.values(entry.translations).some((t: Record<string, string>) => 'subject' in t)
                    const msgMissing = isMissing(getDraft(entry.name, lang, 'message'))
                    const subjVal = getDraft(entry.name, lang, 'subject')
                    const msgVal = getDraft(entry.name, lang, 'message')
                    const sugKey = `${entry.name}:${lang}`
                    return (
                      <div key={lang} className={`p-3 border-r border-gray-100 last:border-r-0 ${msgMissing ? 'bg-red-50/40' : ''}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-xs font-semibold ${lang === referenceLang ? 'text-blue-700' : 'text-gray-700'}`}>
                            {lang} {lang === referenceLang && <span className="badge-ok ml-1">ref</span>}
                          </span>
                          {msgMissing && <span className="badge-missing">missing</span>}
                        {(() => {
                          const refMsg = entry.translations[bestRefLang]?.message ?? ''
                          const refVars = getTemplateVars(refMsg)
                          if (!refVars.length || msgMissing) return null
                          const curVars = getTemplateVars(getDraft(entry.name, lang, 'message'))
                          const missing = refVars.filter(v => !curVars.includes(v))
                          const extra = curVars.filter(v => !refVars.includes(v))
                          if (!missing.length && !extra.length) return null
                          return (
                            <Tooltip text={[
                              missing.length ? `Missing vars: ${missing.join(', ')}` : '',
                              extra.length ? `Extra vars: ${extra.join(', ')}` : ''
                            ].filter(Boolean).join(' · ')} side="bottom">
                              <span className="inline-flex items-center gap-0.5 text-xs bg-yellow-100 text-yellow-800 border border-yellow-300 px-1 py-0.5 rounded-full cursor-help">
                                <AlertTriangle size={9} /> vars
                              </span>
                            </Tooltip>
                          )
                        })()}
                        </div>

                        {hasSubject && (
                          <div className="mb-2">
                            <label className="text-xs text-gray-500 mb-0.5 block">Subject</label>
                            <div className="flex gap-1">
                              <input
                                className={`input text-xs py-1 flex-1 ${isMissing(subjVal) ? 'cell-missing' : ''}`}
                                value={subjVal}
                                onChange={e => setDraft(entry.name, lang, 'subject', e.target.value)}
                                placeholder="— missing —"
                              />
                              <button
                                className="btn-ghost text-xs py-1 px-1.5 text-blue-500"
                                onClick={() => handleAISuggest(entry.name, lang, 'subject')}
                                disabled={suggesting === `${sugKey}:subject`}
                                title="AI translate"
                              >
                                <Wand2 size={11} className={suggesting === `${sugKey}:subject` ? 'animate-pulse' : ''} />
                              </button>
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="text-xs text-gray-500 mb-0.5 block">Message (HTML)</label>
                          <div className="relative">
                            <textarea
                              className={`input text-xs py-1 font-mono min-h-[6rem] resize-y ${msgMissing ? 'cell-missing' : ''}`}
                              value={msgVal}
                              onChange={e => setDraft(entry.name, lang, 'message', e.target.value)}
                              placeholder="— missing —"
                            />
                            <button
                              className="absolute top-1 right-1 btn-ghost text-xs py-0.5 px-1.5 text-blue-500 bg-white"
                              onClick={() => handleAISuggest(entry.name, lang, 'message')}
                              disabled={suggesting === `${sugKey}:message`}
                              title="AI translate"
                            >
                              <Wand2 size={11} className={suggesting === `${sugKey}:message` ? 'animate-pulse' : ''} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
