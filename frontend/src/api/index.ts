import axios from 'axios'
import type { JsonCategoryData, MailData, MdsGroupData, AppStats, QualityIssue, AppConfig, AiFillResult, AiReviewResult } from '../types'

const api = axios.create({ baseURL: '/api' })

// ── Stats ─────────────────────────────────────────────────────────────────────
export const fetchStats = (): Promise<AppStats> =>
  api.get('/stats').then(r => r.data)

// ── JSON ──────────────────────────────────────────────────────────────────────
export const fetchJsonCategories = (): Promise<string[]> =>
  api.get('/json/categories').then(r => r.data)

export const fetchJsonCategory = (category: string, sort = 'file', refLang = 'de'): Promise<JsonCategoryData> =>
  api.get(`/json/${category}`, { params: { sort, ref_lang: refLang } }).then(r => r.data)

export const saveJsonLang = (category: string, lang: string, flat: Record<string, string>) =>
  api.put('/json/save', { category, lang, flat }).then(r => r.data)

export const addJsonLanguage = (lang: string, baseOn?: string, description?: string) =>
  api.post('/json/add-language', { area: 'json', lang, base_on: baseOn, description }).then(r => r.data)

export const fetchJsonQuality = (category: string): Promise<{ issues: QualityIssue[] }> =>
  api.get(`/json/${category}/quality`).then(r => r.data)

// ── Mail ──────────────────────────────────────────────────────────────────────
export const fetchMail = (): Promise<MailData> =>
  api.get('/mail').then(r => r.data)

export const saveMailLang = (lang: string, templates: Record<string, { subject?: string; message?: string }>) =>
  api.put('/mail/save', { lang, templates }).then(r => r.data)

export const addMailLanguage = (lang: string, description?: string) =>
  api.post('/mail/add-language', { area: 'mail', lang, description }).then(r => r.data)

// ── MDS ───────────────────────────────────────────────────────────────────────
export const fetchMdsGroups = (): Promise<Record<string, string[]>> =>
  api.get('/mds/groups').then(r => r.data)

export const fetchMdsGroup = (group: string, sort = 'file', refLang = 'default'): Promise<MdsGroupData> =>
  api.get(`/mds/${group}`, { params: { sort, ref_lang: refLang } }).then(r => r.data)

export const saveMdsGroup = (group: string, lang: string, translations: Record<string, string>) =>
  api.put('/mds/save', { group, lang, translations }).then(r => r.data)

export const addMdsLanguage = (lang: string, description?: string) =>
  api.post('/mds/add-language', { area: 'mds', lang, description }).then(r => r.data)

export const fetchMdsQuality = (group: string): Promise<{ issues: QualityIssue[] }> =>
  api.get(`/mds/${group}/quality`).then(r => r.data)

// ── AI ────────────────────────────────────────────────────────────────────────
export const aiTranslate = (text: string, sourceLang: string, targetLang: string, context?: string) =>
  api.post('/ai/translate', { text, source_lang: sourceLang, target_lang: targetLang, context })
     .then(r => r.data as { translation: string })

export const aiFillEmpty = (area: string, id: string, targetLang: string, refLang = 'de'): Promise<AiFillResult> =>
  api.post('/ai/fill-empty', { area, id, target_lang: targetLang, ref_lang: refLang }).then(r => r.data)

export const aiReview = (area: string, id: string, targetLang: string, refLang = 'de', maxKeys = 20): Promise<AiReviewResult> =>
  api.post('/ai/review', { area, id, target_lang: targetLang, ref_lang: refLang, max_keys: maxKeys }).then(r => r.data)

// ── Config ────────────────────────────────────────────────────────────────────
export const fetchAppConfig = (): Promise<AppConfig> =>
  api.get('/config').then(r => r.data)

export const saveAppConfig = (payload: { b_api_key?: string; custom_areas?: unknown[]; lang_descriptions?: Record<string, string> }) =>
  api.post('/config', payload).then(r => r.data)

// ── Backup / Download ─────────────────────────────────────────────────────────
export const createBackup = () => api.post('/backup').then(r => r.data)
export const fetchBackups = (): Promise<string[]> => api.get('/backups').then(r => r.data)
export const downloadArea = (area: string) => window.open(`/api/download/${area}`, '_blank')
export const downloadAll = () => window.open('/api/download-all', '_blank')
