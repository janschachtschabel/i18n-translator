import { useState } from 'react'
import { Wand2, CheckCircle, XCircle, AlertTriangle, RefreshCw, X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { aiFillEmpty, aiReview, saveJsonLang, saveMdsGroup } from '../api'
import type { ReviewIssue, TranslationEntry } from '../types'

interface Props {
  area: 'json' | 'mds'
  id: string                      // category or group name
  languages: string[]
  referenceLang: string
  entries: TranslationEntry[]
  queryKey: unknown[]             // for cache invalidation
  onClose: () => void
  onStatsChange: () => void
}

type Mode = 'fill' | 'review'

export default function AiFillPanel({
  area, id, languages, referenceLang, entries, queryKey, onClose, onStatsChange,
}: Props) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<Mode>('fill')
  const [targetLang, setTargetLang] = useState(languages.find(l => l !== referenceLang) ?? languages[0])
  const [fillPreviews, setFillPreviews] = useState<Record<string, string>>({})
  const [accepted, setAccepted] = useState<Record<string, boolean>>({})
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([])
  const [reviewedCount, setReviewedCount] = useState(0)
  const [reviewAccepted, setReviewAccepted] = useState<Record<string, string>>({})

  const emptyKeys = entries.filter(e => !(e.translations[targetLang] ?? '').trim()).map(e => e.key)

  // ── Fill empty ──────────────────────────────────────────────────────────────
  const fillMutation = useMutation({
    mutationFn: () => aiFillEmpty(area, id, targetLang, referenceLang),
    onSuccess: (data) => {
      setFillPreviews(data.translations)
      setAccepted(Object.fromEntries(Object.keys(data.translations).map(k => [k, true])))
    },
  })

  const applyMutation = useMutation({
    mutationFn: async () => {
      const toApply = Object.fromEntries(
        Object.entries(fillPreviews).filter(([k]) => accepted[k])
      )
      // Build full flat map for this lang
      const currentFlat: Record<string, string> = {}
      for (const e of entries) {
        currentFlat[e.key] = e.translations[targetLang] ?? ''
      }
      const merged = { ...currentFlat, ...toApply }
      if (area === 'json') {
        return saveJsonLang(id, targetLang, merged)
      } else {
        return saveMdsGroup(id, targetLang, merged)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      qc.invalidateQueries({ queryKey: ['stats'] })
      onStatsChange()
      setFillPreviews({})
      setAccepted({})
    },
  })

  // ── Review ──────────────────────────────────────────────────────────────────
  const reviewMutation = useMutation({
    mutationFn: () => aiReview(area, id, targetLang, referenceLang, 30),
    onSuccess: (data) => {
      setReviewIssues(data.issues)
      setReviewedCount(data.reviewed)
      setReviewAccepted(Object.fromEntries(data.issues.map(i => [i.key, ''])))
    },
  })

  const applyReviewMutation = useMutation({
    mutationFn: async () => {
      const toApply: Record<string, string> = {}
      for (const [key, val] of Object.entries(reviewAccepted)) {
        if (val.trim()) toApply[key] = val
      }
      if (Object.keys(toApply).length === 0) return
      const currentFlat: Record<string, string> = {}
      for (const e of entries) currentFlat[e.key] = e.translations[targetLang] ?? ''
      const merged = { ...currentFlat, ...toApply }
      if (area === 'json') return saveJsonLang(id, targetLang, merged)
      else return saveMdsGroup(id, targetLang, merged)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      qc.invalidateQueries({ queryKey: ['stats'] })
      onStatsChange()
    },
  })

  const acceptedCount = Object.values(accepted).filter(Boolean).length

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 w-96 flex-shrink-0 shadow-xl">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white flex-shrink-0">
        <Wand2 size={15} />
        <span className="font-semibold text-sm">AI Translation Tools</span>
        <span className="text-blue-200 text-xs">— {id}</span>
        <div className="flex-1" />
        <button onClick={onClose} className="p-0.5 hover:bg-blue-500 rounded"><X size={14} /></button>
      </div>

      {/* Mode tabs + language selector */}
      <div className="flex-shrink-0 border-b border-gray-200 px-4 py-2 space-y-2">
        <div className="flex gap-1">
          {(['fill', 'review'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                mode === m ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {m === 'fill' ? `Fill Empty (${emptyKeys.length})` : 'Review Quality'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Target language:</span>
          <select
            className="input py-0.5 text-xs"
            value={targetLang}
            onChange={e => { setTargetLang(e.target.value); setFillPreviews({}); setReviewIssues([]) }}
          >
            {languages.filter(l => l !== referenceLang).map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <span className="text-gray-400">ref: <b>{referenceLang}</b></span>
        </div>
      </div>

      {/* ── Fill empty mode ── */}
      {mode === 'fill' && (
        <div className="flex-1 overflow-auto flex flex-col min-h-0">
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-600 mb-2">
              <b>{emptyKeys.length}</b> empty fields in <b>{targetLang}</b>. AI will use existing translations as context.
            </p>
            <button
              className="btn-primary text-xs py-1"
              onClick={() => fillMutation.mutate()}
              disabled={fillMutation.isPending || emptyKeys.length === 0}
            >
              <Wand2 size={12} className={fillMutation.isPending ? 'animate-pulse' : ''} />
              {fillMutation.isPending ? 'Generating…' : 'Generate All'}
            </button>
            {fillMutation.isError && (
              <p className="text-red-500 text-xs mt-1">Error: check if B-API key is configured.</p>
            )}
          </div>

          {Object.keys(fillPreviews).length > 0 && (
            <>
              <div className="flex-shrink-0 px-4 py-2 bg-green-50 border-b border-green-200 flex items-center gap-2">
                <CheckCircle size={13} className="text-green-600" />
                <span className="text-xs text-green-700 font-medium">
                  {acceptedCount}/{Object.keys(fillPreviews).length} accepted
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => setAccepted(Object.fromEntries(Object.keys(fillPreviews).map(k => [k, true])))}
                  className="text-xs text-green-700 hover:underline"
                >All</button>
                <button
                  onClick={() => setAccepted(Object.fromEntries(Object.keys(fillPreviews).map(k => [k, false])))}
                  className="text-xs text-gray-500 hover:underline"
                >None</button>
              </div>
              <div className="flex-1 overflow-auto">
                {Object.entries(fillPreviews).map(([key, translation]) => {
                  const refVal = entries.find(e => e.key === key)?.translations[referenceLang] ?? ''
                  return (
                    <div key={key} className={`border-b border-gray-100 px-4 py-2 ${accepted[key] ? '' : 'opacity-50'}`}>
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={accepted[key] ?? true}
                          onChange={e => setAccepted(prev => ({ ...prev, [key]: e.target.checked }))}
                          className="mt-0.5 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-xs text-gray-500 truncate mb-0.5">{key}</div>
                          {refVal && (
                            <div className="text-xs text-gray-400 italic mb-0.5 line-clamp-1">
                              {referenceLang}: {refVal}
                            </div>
                          )}
                          <textarea
                            className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                            rows={2}
                            value={translation}
                            onChange={e => setFillPreviews(prev => ({ ...prev, [key]: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex-shrink-0 p-3 border-t border-gray-200 bg-white">
                <button
                  className="btn-primary w-full text-xs py-1.5"
                  onClick={() => applyMutation.mutate()}
                  disabled={applyMutation.isPending || acceptedCount === 0}
                >
                  {applyMutation.isPending ? <RefreshCw size={12} className="animate-spin mr-1" /> : null}
                  Apply {acceptedCount} translation{acceptedCount !== 1 ? 's' : ''}
                </button>
                {applyMutation.isSuccess && (
                  <p className="text-green-600 text-xs text-center mt-1">Saved!</p>
                )}
              </div>
            </>
          )}

          {fillMutation.isSuccess && Object.keys(fillPreviews).length === 0 && (
            <div className="flex items-center justify-center h-20 text-green-600 text-xs">
              <CheckCircle size={14} className="mr-1" /> No empty fields!
            </div>
          )}
        </div>
      )}

      {/* ── Review mode ── */}
      {mode === 'review' && (
        <div className="flex-1 overflow-auto flex flex-col min-h-0">
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-600 mb-2">
              AI reviews up to 30 existing <b>{targetLang}</b> translations against <b>{referenceLang}</b> for quality issues.
            </p>
            <button
              className="btn-primary text-xs py-1"
              onClick={() => reviewMutation.mutate()}
              disabled={reviewMutation.isPending}
            >
              <Wand2 size={12} className={reviewMutation.isPending ? 'animate-pulse' : ''} />
              {reviewMutation.isPending ? 'Reviewing…' : 'Start Review'}
            </button>
            {reviewMutation.isError && (
              <p className="text-red-500 text-xs mt-1">Error: check if B-API key is configured.</p>
            )}
          </div>

          {reviewMutation.isSuccess && (
            <div className="flex-shrink-0 px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
              Reviewed {reviewedCount} keys — <b>{reviewIssues.length} issue{reviewIssues.length !== 1 ? 's' : ''}</b> found
            </div>
          )}

          {reviewIssues.length > 0 && (
            <>
              <div className="flex-1 overflow-auto">
                {reviewIssues.map((issue) => (
                  <div key={issue.key} className="border-b border-gray-100 px-4 py-3">
                    <div className="font-mono text-xs text-gray-500 mb-1">{issue.key}</div>
                    <div className="flex items-start gap-1 mb-1">
                      <AlertTriangle size={11} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-gray-700">{issue.issue}</span>
                    </div>
                    <div className="text-xs text-gray-400 mb-1">Current: <i>{issue.current}</i></div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Suggested correction:</label>
                      <textarea
                        className="w-full text-xs border border-blue-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none bg-blue-50"
                        rows={2}
                        value={reviewAccepted[issue.key] ?? issue.suggestion}
                        onChange={e => setReviewAccepted(prev => ({ ...prev, [issue.key]: e.target.value }))}
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => setReviewAccepted(prev => ({ ...prev, [issue.key]: issue.suggestion }))}
                          className="btn-secondary text-xs py-0.5 px-2"
                        >
                          <CheckCircle size={10} /> Use
                        </button>
                        <button
                          onClick={() => setReviewAccepted(prev => ({ ...prev, [issue.key]: '' }))}
                          className="btn-ghost text-xs py-0.5 px-2 text-gray-400"
                        >
                          <XCircle size={10} /> Skip
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex-shrink-0 p-3 border-t border-gray-200 bg-white">
                <button
                  className="btn-primary w-full text-xs py-1.5"
                  onClick={() => applyReviewMutation.mutate()}
                  disabled={applyReviewMutation.isPending || Object.values(reviewAccepted).every(v => !v?.trim())}
                >
                  {applyReviewMutation.isPending ? <RefreshCw size={12} className="animate-spin mr-1" /> : null}
                  Apply Selected Corrections
                </button>
                {applyReviewMutation.isSuccess && (
                  <p className="text-green-600 text-xs text-center mt-1">Corrections saved!</p>
                )}
              </div>
            </>
          )}

          {reviewMutation.isSuccess && reviewIssues.length === 0 && (
            <div className="flex items-center justify-center h-20 text-green-600 text-xs">
              <CheckCircle size={14} className="mr-1" /> All translations look good!
            </div>
          )}
        </div>
      )}
    </div>
  )
}
