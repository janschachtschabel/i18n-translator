export type AreaId = 'json' | 'mail' | 'mds'

export interface TranslationEntry {
  key: string
  translations: Record<string, string>
}

export interface MailEntry {
  name: string
  translations: Record<string, { subject?: string; message?: string }>
}

export interface JsonCategoryData {
  category: string
  languages: string[]
  entries: TranslationEntry[]
}

export interface MailData {
  languages: string[]
  entries: MailEntry[]
}

export interface MdsGroupData {
  group: string
  languages: string[]
  entries: TranslationEntry[]
}

export interface QualityIssue {
  key: string
  lang: string
  type: 'missing' | 'template_mismatch'
  expected?: string[]
  found?: string[]
}

export interface AreaStats {
  categories?: number
  groups?: string[]
  languages: string[]
  total_keys?: number
  total_templates?: number
  missing_values: number
}

export interface AppStats {
  areas: {
    json: AreaStats
    mail: AreaStats
    mds: AreaStats
  }
}

export interface AppSettings {
  referenceLang: string
  visibleLangs: Record<AreaId, string[]>
}

export interface CustomArea {
  id: string
  name: string
  format: 'json' | 'properties'
  path: string
}

export interface AppConfig {
  b_api_key_set: boolean
  b_api_key_source: 'env' | 'config' | 'none'
  b_api_key: string
  custom_areas: CustomArea[]
  lang_descriptions: Record<string, string>        // merged: defaults + custom overrides
  lang_descriptions_custom: Record<string, string> // only user-saved overrides
}

export interface AiFillResult {
  translations: Record<string, string>
  count: number
}

export interface ReviewIssue {
  key: string
  current: string
  issue: string
  suggestion: string
}

export interface AiReviewResult {
  issues: ReviewIssue[]
  reviewed: number
}

export type SortOrder = 'file' | 'alpha'
