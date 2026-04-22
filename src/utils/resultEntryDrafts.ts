export type ResultEntryDraftRow = Record<string, number | null>
export type ResultEntryDraftMap = Record<string, ResultEntryDraftRow>

const STORAGE_PREFIX = 'fmhs-result-entry-draft'

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function buildResultEntryDraftKey(scope: string, owner: string, className: string, section: string, subject: string): string | null {
  if (!owner.trim() || !className.trim() || !section.trim() || !subject.trim()) return null

  return [
    STORAGE_PREFIX,
    scope.trim().toLowerCase(),
    owner.trim().toLowerCase(),
    className.trim(),
    section.trim(),
    subject.trim(),
  ].map(part => encodeURIComponent(part)).join(':')
}

function writeResultEntryDrafts(storageKey: string, drafts: ResultEntryDraftMap): void {
  if (!canUseLocalStorage()) return

  if (Object.keys(drafts).length === 0) {
    window.localStorage.removeItem(storageKey)
    return
  }

  window.localStorage.setItem(storageKey, JSON.stringify(drafts))
}

export function readResultEntryDrafts(storageKey: string | null): ResultEntryDraftMap {
  if (!storageKey || !canUseLocalStorage()) return {}

  const raw = window.localStorage.getItem(storageKey)
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const drafts: ResultEntryDraftMap = {}
    Object.entries(parsed as Record<string, unknown>).forEach(([iid, draftValue]) => {
      if (!draftValue || typeof draftValue !== 'object' || Array.isArray(draftValue)) return

      const rowDraft: ResultEntryDraftRow = {}
      Object.entries(draftValue as Record<string, unknown>).forEach(([column, mark]) => {
        if (mark === null || mark === '') {
          rowDraft[column] = null
          return
        }

        const numericValue = Number(mark)
        if (Number.isFinite(numericValue)) rowDraft[column] = numericValue
      })

      if (Object.keys(rowDraft).length > 0) drafts[iid] = rowDraft
    })

    return drafts
  } catch {
    return {}
  }
}

export function upsertResultEntryDraft(storageKey: string | null, iid: string, rowDraft: ResultEntryDraftRow): void {
  if (!storageKey || !iid || !canUseLocalStorage()) return

  const drafts = readResultEntryDrafts(storageKey)
  const sanitizedDraft = Object.fromEntries(
    Object.entries(rowDraft).filter(([, value]) => value === null || (typeof value === 'number' && Number.isFinite(value))),
  ) as ResultEntryDraftRow

  if (Object.keys(sanitizedDraft).length === 0) {
    delete drafts[iid]
  } else {
    drafts[iid] = sanitizedDraft
  }

  writeResultEntryDrafts(storageKey, drafts)
}

export function clearResultEntryDrafts(storageKey: string | null): void {
  if (!storageKey || !canUseLocalStorage()) return
  window.localStorage.removeItem(storageKey)
}