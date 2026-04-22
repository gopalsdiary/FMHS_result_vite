import { supabase } from '@/lib/supabaseClient'

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

export async function loadExamAnn25Meta(): Promise<ExamAnn25Meta> {
  const { data, error } = await supabase.from('exam_ann25').select('class_2025, section_2025')
  if (error) throw error

  const sectionsByClass: Record<string, Set<string>> = {}

  for (const row of data ?? []) {
    const classValue = normalizeClassValue((row as Record<string, unknown>).class_2025)
    const sectionValue = normalizeSectionValue((row as Record<string, unknown>).section_2025)
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