import { useState, useRef, useCallback } from 'react'
import { Wand2, ChevronDown, ChevronUp, AlertTriangle, ArrowUpDown, AlignJustify } from 'lucide-react'
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
}

const DEFAULT_COL_WIDTH = 220
const MIN_COL_WIDTH = 100
const MAX_COL_WIDTH = 300

function isMissing(v: string) {
  return !v || !v.trim()
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
        } ${varMismatch ? 'border-yellow-400 bg-yellow-50' : ''}`}
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
  sortOrder = 'file',
  onSortChange,
  onSave,
  isSaving,
}: Props) {
  const displayLangs = visibleLangs && visibleLangs.length > 0 ? visibleLangs : languages
  const [colWidths, setColWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(displayLangs.map(l => [l, DEFAULT_COL_WIDTH]))
  )
  const dragRef = useRef<{ lang: string; startX: number; startW: number } | null>(null)

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

  const filtered = entries.filter(e => {
    if (filter) {
      const lf = filter.toLowerCase()
      const keyMatch = e.key.toLowerCase().includes(lf)
      const valMatch = Object.values(e.translations).some(v => v.toLowerCase().includes(lf))
      if (!keyMatch && !valMatch) return false
    }
    if (showMissingOnly) {
      if (!displayLangs.some(l => isMissing(e.translations[l] ?? ''))) return false
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

  const KEY_COL_W = 220

  return (
    <div className="overflow-auto h-full">
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
              </div>
            </th>
            {displayLangs.map(lang => {
              const w = colWidths[lang] ?? DEFAULT_COL_WIDTH
              const missingCount = entries.filter(e => isMissing(e.translations[lang] ?? '')).length
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
                  </div>
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
            const rowMissing = displayLangs.some(l => isMissing(entry.translations[l] ?? ''))
            return (
              <tr
                key={entry.key}
                className={`border-b border-gray-100 ${
                  rowMissing ? 'bg-red-50/30' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                } hover:bg-blue-50/30 transition-colors`}
              >
                {/* Sticky key cell */}
                <td
                  className="px-3 py-1.5 align-top sticky left-0 z-10 border-r border-gray-100"
                  style={{ width: KEY_COL_W, backgroundColor: rowMissing ? 'rgb(254 242 242 / 0.5)' : (i % 2 === 0 ? 'white' : 'rgb(249 250 251 / 0.5)') }}
                >
                  <div className="font-mono text-gray-600 text-xs break-all leading-relaxed">
                    {entry.key}
                  </div>
                </td>
                {displayLangs.map(lang => {
                  const val = entry.translations[lang] ?? ''
                  const missing = isMissing(val)
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
