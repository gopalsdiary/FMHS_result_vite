import { supabase } from '@/services/supabaseClient'
import { EXAM_TABLE, COL } from '@/services/examTableConfig'

export type ExamAnn25Meta = {
  classes: string[]
  sectionsByClass: Record<string, string[]>
  sections: string[]
}

function normalizeClassValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeSectionValue(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return raw
}

export async function loadExamAnn25Meta(examId?: number): Promise<ExamAnn25Meta> {
  let query = supabase.from(EXAM_TABLE).select(`${COL.class}, ${COL.section}`)
  if (examId) query = query.eq(COL.examId, examId)

  const { data, error } = await query
  if (error) throw error

  const sectionsByClass: Record<string, Set<string>> = {}

  for (const row of data ?? []) {
    const classValue = normalizeClassValue((row as Record<string, unknown>)[COL.class])
    const sectionValue = normalizeSectionValue((row as Record<string, unknown>)[COL.section])
    if (!classValue || !sectionValue) continue
    if (!sectionsByClass[classValue]) sectionsByClass[classValue] = new Set<string>()
    sectionsByClass[classValue].add(sectionValue)
  }

  const classes = Object.keys(sectionsByClass).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
  const sectionsByClassList: Record<string, string[]> = {}
  const allSections = new Set<string>()

  for (const classValue of classes) {
    const sections = Array.from(sectionsByClass[classValue]).sort()
    sectionsByClassList[classValue] = sections
    sections.forEach(section => allSections.add(section))
  }

  return {
    classes,
    sectionsByClass: sectionsByClassList,
    sections: Array.from(allSections).sort(),
  }
}
