import { useState, useRef, useCallback, useEffect } from 'react'
import { Wand2, ChevronDown, ChevronUp, AlertTriangle, ArrowUpDown, AlignJustify, Trash2, Plus, SlidersHorizontal, X, Equal } from 'lucide-react'
import { aiTranslate } from '../api'
import type { TranslationEntry, SortOrder } from '../types'

interface Props {
  entries: TranslationEntry[]
  languages: string[]
  visibleLangs?: string[]
  referenceLang?: string
  filter?: string
  showMissingOnly?: boolean
  showErrorsOnly?: boolean
  sortOrder?: SortOrder
  onSortChange?: (s: SortOrder) => void
  onSave: (lang: string, key: string, value: string) => void
  isSaving?: boolean
  variantFilters?: Record<string, string>
  onDeleteKey?: (key: string) => void
  onInsertAfterKey?: (key: string) => void
}

const DEFAULT_COL_WIDTH = 220
const MIN_COL_WIDTH = 100
const MAX_COL_WIDTH = 800

function isMissing(v: string) {
  return !v || !v.trim()
}

function isEffectivelyMissing(
  val: string,
  lang: string,
  refVal: string,
  variantFilters: Record<string, string>
): boolean {
  if (!isMissing(val)) return false
  const pattern = variantFilters[lang]
  if (!pattern) return true
  try { return new RegExp(pattern).test(refVal) } catch { return true }
}

function getTemplateVars(s: string): string[] {
  return Array.from(s.matchAll(/\{\{[^}]+\}\}/g)).map(m => m[0])
}

function CellEditor({
  value,
  missing,
  refValue,
  lang,
  keyName,
  referenceLang,
  onSave,
}: {
  value: string
  missing: boolean
  refValue: string
  lang: string
  keyName: string
  referenceLang: string
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [suggesting, setSuggesting] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleAI = async () => {
    if (!refValue.trim()) return
    setSuggesting(true)
    try {
      const res = await aiTranslate(refValue, referenceLang, lang, `Key: ${keyName}`)
      setDraft(res.translation)
      setEditing(true)
    } catch {
      // ignore
    } finally {
      setSuggesting(false)
    }
  }

  const sameAsRef = !missing && value.trim() !== '' && value === refValue && lang !== referenceLang

  const refVars = getTemplateVars(refValue)
  const draftVars = getTemplateVars(draft)
  const varMismatch =
    refVars.length > 0 && JSON.stringify(refVars.slice().sort()) !== JSON.stringify(draftVars.slice().sort())
  const missingVars = refVars.filter(v => !draftVars.includes(v))
  const extraVars = draftVars.filter(v => !refVars.includes(v))

  if (!editing) {
    return (
      <div
        className={`group relative min-h-[2rem] px-2 py-1 rounded text-xs ${
          missing ? 'bg-red-50 border border-red-300' : 'bg-white border border-gray-200'
        } ${varMismatch ? 'border-yellow-400 bg-yellow-50' : ''} ${sameAsRef && !varMismatch ? 'border-orange-200 bg-orange-50/30' : ''}`}
        onClick={() => { setDraft(value); setEditing(true) }}
        style={{ cursor: 'text' }}
      >
        {missing ? (
          <span className="text-red-400 italic">— missing —</span>
        ) : (
          <span className={expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}>
            {value}
          </span>
        )}
        {varMismatch && (
          <span
            className="inline-flex items-center gap-0.5 ml-1 cursor-help"
            title={[
              missingVars.length ? `Missing: ${missingVars.join(', ')}` : '',
              extraVars.length ? `Extra: ${extraVars.join(', ')}` : ''
            ].filter(Boolean).join(' · ')}
          >
            <AlertTriangle size={11} className="text-yellow-500" />
          </span>
        )}
        {sameAsRef && (
          <span
            className="inline-flex items-center gap-0.5 ml-1 cursor-help"
            title={`Value is identical to ${referenceLang} — possibly not translated`}
          >
            <Equal size={11} className="text-orange-400" />
          </span>
        )}
        <div className="absolute right-1 top-1 hidden group-hover:flex gap-1">
          {value.length > 80 && (
            <button
              className="p-0.5 rounded hover:bg-gray-200"
              onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
            >
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
          )}
          <button
            className="p-0.5 rounded hover:bg-blue-100 text-blue-500"
            title="AI translate"
            onClick={e => { e.stopPropagation(); handleAI() }}
            disabled={suggesting}
          >
            <Wand2 size={10} className={suggesting ? 'animate-pulse' : ''} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <textarea
        autoFocus
        className={`w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[3rem] resize-y ${
          varMismatch ? 'border-yellow-400' : 'border-blue-400'
        }`}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setEditing(false); setDraft(value) }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            onSave(draft)
            setEditing(false)
          }
        }}
      />
      {varMismatch && (
        <p className="text-yellow-700 text-xs bg-yellow-50 border border-yellow-200 rounded px-2 py-1 flex items-start gap-1">
          <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
          <span>
            <strong>Variable mismatch</strong>
            {missingVars.length > 0 && <span className="block">Missing: <code>{missingVars.join(', ')}</code></span>}
            {extraVars.length > 0 && <span className="block">Extra: <code>{extraVars.join(', ')}</code></span>}
          </span>
        </p>
      )}
      <div className="flex gap-1">
        <button
          className="btn-primary text-xs py-0.5 px-2"
          onClick={() => { onSave(draft); setEditing(false) }}
        >
          Save
        </button>
        <button
          className="btn-secondary text-xs py-0.5 px-2"
          onClick={() => { setEditing(false); setDraft(value) }}
        >
          Cancel
        </button>
        <button
          className="btn-ghost text-xs py-0.5 px-2 text-blue-600"
          onClick={handleAI}
          disabled={suggesting || !refValue.trim()}
          title="AI translate from reference"
        >
          <Wand2 size={11} className={suggesting ? 'animate-pulse' : ''} />
          {suggesting ? 'Translating…' : 'AI Suggest'}
        </button>
      </div>
    </div>
  )
}

export default function TranslationTable({
  entries,
  languages,
  visibleLangs,
  referenceLang = 'de',
  filter = '',
  showMissingOnly = false,
  showErrorsOnly = false,
  sortOrder = 'alpha',
  onSortChange,
  onSave,
  isSaving,
  variantFilters = {},
  onDeleteKey,
  onInsertAfterKey,
}: Props) {
  const displayLangs = visibleLangs && visibleLangs.length > 0 ? visibleLangs : languages
  const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(displayLangs.map(l => [l, DEFAULT_COL_WIDTH]))
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ lang: string; startX: number; startW: number } | null>(null)

  const KEY_COL_W = 220
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const [showColFilters, setShowColFilters] = useState(false)
  const [showSameAsRefOnly, setShowSameAsRefOnly] = useState(false)

  useEffect(() => {
    const containerW = containerRef.current?.clientWidth ?? 0
    const availW = containerW > KEY_COL_W + MIN_COL_WIDTH * displayLangs.length
      ? containerW - KEY_COL_W
      : DEFAULT_COL_WIDTH * displayLangs.length
    const equalW = Math.max(MIN_COL_WIDTH, Math.floor(availW / Math.max(1, displayLangs.length)))
    setColWidths(Object.fromEntries(displayLangs.map(l => [l, equalW])))
  }, [displayLangs.join(',')])

  const startResize = useCallback((lang: string, e: React.MouseEvent) => {
    e.preventDefault()
    const startW = colWidths[lang] ?? DEFAULT_COL_WIDTH
    dragRef.current = { lang, startX: e.clientX, startW }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = ev.clientX - dragRef.current.startX
      const newW = Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, dragRef.current.startW + delta))
      setColWidths(prev => ({ ...prev, [dragRef.current!.lang]: newW }))
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [colWidths])

  const HIDDEN_KEYS = ['this_is_a_bug_the_first_line_will_not_be_translated']
  const filtered = entries.filter(e => {
    if (HIDDEN_KEYS.includes(e.key)) return false
    if (filter) {
      const lf = filter.toLowerCase()
      const keyMatch = e.key.toLowerCase().includes(lf)
      const valMatch = Object.values(e.translations).some(v => v.toLowerCase().includes(lf))
      if (!keyMatch && !valMatch) return false
    }
    for (const [lang, cf] of Object.entries(colFilters)) {
      if (!cf) continue
      const val = (lang === '__key__' ? e.key : (e.translations[lang] ?? '')).toLowerCase()
      if (cf === '!') { if (val.trim()) return false }
      else if (cf.startsWith('!')) { if (val.includes(cf.slice(1).toLowerCase())) return false }
      else { if (!val.includes(cf.toLowerCase())) return false }
    }
    if (showMissingOnly) {
      const refV = e.translations[referenceLang] ?? ''
      if (!displayLangs.some(l => isEffectivelyMissing(e.translations[l] ?? '', l, refV, variantFilters))) return false
    }
    if (showSameAsRefOnly) {
      const refV = e.translations[referenceLang] ?? ''
      if (!refV.trim()) return false
      const hasSameAsRef = displayLangs.some(l =>
        l !== referenceLang && (e.translations[l] ?? '') === refV && (e.translations[l] ?? '').trim() !== ''
      )
      if (!hasSameAsRef) return false
    }
    if (showErrorsOnly) {
      const refVal = e.translations[referenceLang] ?? ''
      const refVars = getTemplateVars(refVal)
      if (refVars.length === 0) return false
      const hasVarError = displayLangs
        .filter(l => l !== referenceLang && !isMissing(e.translations[l] ?? ''))
        .some(l => {
          const tv = getTemplateVars(e.translations[l] ?? '')
          return JSON.stringify(refVars.slice().sort()) !== JSON.stringify(tv.slice().sort())
        })
      if (!hasVarError) return false
    }
    return true
  })

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        No entries match the current filter.
      </div>
    )
  }

  return (
    <div className="overflow-auto h-full" ref={containerRef}>
      {isSaving && (
        <div className="fixed top-4 right-4 z-50 bg-blue-600 text-white text-xs px-3 py-1.5 rounded shadow">
          Saving…
        </div>
      )}
      <table className="border-collapse text-xs" style={{ tableLayout: 'fixed', width: `${KEY_COL_W + displayLangs.reduce((s, l) => s + (colWidths[l] ?? DEFAULT_COL_WIDTH), 0)}px` }}>
        <thead className="sticky top-0 z-20 bg-gray-100">
          <tr>
            {/* Key column – sticky left */}
            <th
              className="text-left px-3 py-2 font-semibold text-gray-700 border-b border-r border-gray-300 sticky left-0 z-20 bg-gray-100"
              style={{ width: KEY_COL_W, minWidth: KEY_COL_W }}
            >
              <div className="flex items-center gap-2">
                <span>Key</span>
                {onSortChange && (
                  <button
                    onClick={() => onSortChange(sortOrder === 'file' ? 'alpha' : 'file')}
                    className="p-0.5 rounded hover:bg-gray-200 text-gray-500"
                    title={sortOrder === 'file' ? 'Switch to alphabetical sort' : 'Switch to file order'}
                  >
                    {sortOrder === 'file'
                      ? <AlignJustify size={11} />
                      : <ArrowUpDown size={11} className="text-blue-600" />}
                  </button>
                )}
                <button
                  onClick={() => { setShowColFilters(v => !v); if (showColFilters) setColFilters({}) }}
                  className={`p-0.5 rounded hover:bg-gray-200 ${showColFilters || Object.values(colFilters).some(Boolean) ? 'text-blue-600' : 'text-gray-400'}`}
                  title="Toggle per-column filters"
                >
                  <SlidersHorizontal size={11} />
                </button>
                <button
                  onClick={() => setShowSameAsRefOnly(v => !v)}
                  className={`p-0.5 rounded hover:bg-gray-200 ${showSameAsRefOnly ? 'text-orange-500' : 'text-gray-400'}`}
                  title="Show only rows with possibly untranslated values (= reference)"
                >
                  <Equal size={11} />
                </button>
              </div>
              {showColFilters && (
                <input
                  className="mt-1 w-full input text-xs py-0.5 font-mono"
                  placeholder="key filter…"
                  value={colFilters['__key__'] ?? ''}
                  onChange={e => setColFilters(prev => ({ ...prev, '__key__': e.target.value }))}
                />
              )}
            </th>
            {displayLangs.map(lang => {
              const w = colWidths[lang] ?? DEFAULT_COL_WIDTH
              const missingCount = entries.filter(e => isEffectivelyMissing(e.translations[lang] ?? '', lang, e.translations[referenceLang] ?? '', variantFilters)).length
              const sameAsRefCount = lang !== referenceLang
                ? entries.filter(e => {
                    const refV = e.translations[referenceLang] ?? ''
                    const v = e.translations[lang] ?? ''
                    return v.trim() !== '' && v === refV
                  }).length
                : 0
              return (
                <th
                  key={lang}
                  className="text-left px-3 py-2 font-semibold text-gray-700 border-b border-gray-300 relative select-none"
                  style={{ width: w, minWidth: MIN_COL_WIDTH, maxWidth: MAX_COL_WIDTH }}
                >
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="truncate">{lang}</span>
                    {lang === referenceLang && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded flex-shrink-0">ref</span>
                    )}
                    {missingCount > 0 && (
                      <span className="badge-missing flex-shrink-0">{missingCount}</span>
                    )}
                    {sameAsRefCount > 0 && (
                      <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-xs bg-orange-50 text-orange-500 border border-orange-200 px-1 rounded" title="Values identical to reference (possibly untranslated)">
                        <Equal size={9} />{sameAsRefCount}
                      </span>
                    )}
                  </div>
                  {showColFilters && (
                    <div className="relative mt-1">
                      <input
                        className="w-full input text-xs py-0.5 font-mono pr-5"
                        placeholder="filter…"
                        value={colFilters[lang] ?? ''}
                        onChange={e => setColFilters(prev => ({ ...prev, [lang]: e.target.value }))}
                      />
                      {colFilters[lang] && (
                        <button className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setColFilters(prev => { const n = { ...prev }; delete n[lang]; return n })}>
                          <X size={9} />
                        </button>
                      )}
                    </div>
                  )}
                  {/* Resize handle */}
                  <div
                    className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-400 active:bg-blue-600 opacity-40 hover:opacity-100 transition-opacity"
                    onMouseDown={e => startResize(lang, e)}
                  />
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {filtered.map((entry, i) => {
            const refValue = entry.translations[referenceLang] ?? ''
            const rowMissing = displayLangs.some(l => isEffectivelyMissing(entry.translations[l] ?? '', l, refValue, variantFilters))
            return (
              <tr
                key={entry.key}
                className={`border-b border-gray-100 ${
                  rowMissing ? 'bg-red-50/30' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                } hover:bg-blue-50/30 transition-colors`}
              >
                {/* Sticky key cell */}
                <td
                  className="px-3 py-1.5 align-top sticky left-0 z-10 border-r border-gray-100 group/key"
                  style={{ width: KEY_COL_W, minWidth: KEY_COL_W, background: rowMissing ? '#fff5f5' : i % 2 === 0 ? 'white' : '#f9fafb' }}
                >
                  <div className="flex items-start gap-1">
                    <span className="font-mono text-gray-600 text-xs break-all leading-relaxed flex-1">{entry.key}</span>
                    {(onDeleteKey || onInsertAfterKey) && (
                      <div className="flex-shrink-0 flex flex-col gap-0.5 opacity-0 group-hover/key:opacity-100 transition-opacity">
                        {onInsertAfterKey && (
                          <button
                            title="Insert key after this one"
                            onClick={() => onInsertAfterKey(entry.key)}
                            className="p-0.5 rounded hover:bg-blue-100 text-blue-400 hover:text-blue-600"
                          >
                            <Plus size={10} />
                          </button>
                        )}
                        {onDeleteKey && (
                          <button
                            title="Delete this key from all languages"
                            onClick={() => onDeleteKey(entry.key)}
                            className="p-0.5 rounded hover:bg-red-100 text-red-300 hover:text-red-500"
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                {displayLangs.map(lang => {
                  const val = entry.translations[lang] ?? ''
                  const missing = isEffectivelyMissing(val, lang, refValue, variantFilters)
                  const w = colWidths[lang] ?? DEFAULT_COL_WIDTH
                  return (
                    <td key={lang} className="px-2 py-1.5 align-top" style={{ width: w, maxWidth: MAX_COL_WIDTH }}>
                      <CellEditor
                        value={val}
                        missing={missing}
                        refValue={refValue}
                        lang={lang}
                        keyName={entry.key}
                        referenceLang={referenceLang}
                        onSave={v => onSave(lang, entry.key, v)}
                      />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
