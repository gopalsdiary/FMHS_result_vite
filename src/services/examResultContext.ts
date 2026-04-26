import { supabase } from './supabaseClient'

export interface ExamSubjectRule {
  id: number
  subject_code: string
  subject_name: string
  full_marks: number
  pass_cq: number
  pass_mcq: number
  pass_practical: number
  pass_total: number
  total_cq: number
  total_mcq: number
  total_practical: number
  exam_class?: Array<{
    class: number
    is_fourth_subject?: boolean
    exclude_from_rank?: boolean
  }> | null
}

export interface ExamClassAssignment {
  subject_code: string
  class: number
  is_fourth_subject: boolean
  exclude_from_rank: boolean
}

export interface ClassSubjectFlags {
  subjectCodes: Set<string>
  fourthSubjectCodes: Set<string>
  excludeFromRankCodes: Set<string>
}

export function normalizeSubjectValue(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\*+\s*/, '')
    .replace(/[\s_./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactSubjectValue(value: string | null | undefined): string {
  return normalizeSubjectValue(value).replace(/\s+/g, '')
}

export function buildSubjectLookup(rules: ExamSubjectRule[]) {
  const byCode = new Map<string, ExamSubjectRule>()
  const byName = new Map<string, ExamSubjectRule>()
  const byCompactName = new Map<string, ExamSubjectRule>()

  rules.forEach(rule => {
    const codeKey = normalizeSubjectValue(rule.subject_code)
    const nameKey = normalizeSubjectValue(rule.subject_name)
    const compactNameKey = compactSubjectValue(rule.subject_name)

    if (codeKey && !byCode.has(codeKey)) byCode.set(codeKey, rule)
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, rule)
    if (compactNameKey && !byCompactName.has(compactNameKey)) byCompactName.set(compactNameKey, rule)
  })

  return { byCode, byName, byCompactName }
}

export function resolveSubjectRule(
  rules: ExamSubjectRule[] | ReturnType<typeof buildSubjectLookup>,
  label: string | null | undefined,
): ExamSubjectRule | undefined {
  if (!label) return undefined

  const lookup = Array.isArray(rules) ? buildSubjectLookup(rules) : rules
  const normalizedLabel = normalizeSubjectValue(label)
  const compactLabel = compactSubjectValue(label)

  return lookup.byCode.get(normalizedLabel)
    ?? lookup.byName.get(normalizedLabel)
    ?? lookup.byCompactName.get(compactLabel)
    ?? Array.from(lookup.byName.values()).find(rule => {
      const ruleName = normalizeSubjectValue(rule.subject_name)
      const ruleCompactName = compactSubjectValue(rule.subject_name)
      return ruleName.includes(normalizedLabel)
        || normalizedLabel.includes(ruleName)
        || ruleCompactName.includes(compactLabel)
        || compactLabel.includes(ruleCompactName)
    })
}

export function subjectMatchesOptional(
  optionalSubject: string | null | undefined,
  rule: Pick<ExamSubjectRule, 'subject_code' | 'subject_name'>,
): boolean {
  const normalizedOptional = normalizeSubjectValue(optionalSubject)
  if (!normalizedOptional) return false

  const compactOptional = compactSubjectValue(optionalSubject)
  const normalizedCode = normalizeSubjectValue(rule.subject_code)
  const normalizedName = normalizeSubjectValue(rule.subject_name)
  const compactCode = compactSubjectValue(rule.subject_code)
  const compactName = compactSubjectValue(rule.subject_name)

  if (normalizedOptional === normalizedCode || normalizedOptional === normalizedName) return true
  if (compactOptional === compactCode || compactOptional === compactName) return true

  return normalizedName.includes(normalizedOptional)
    || normalizedOptional.includes(normalizedName)
    || compactName.includes(compactOptional)
    || compactOptional.includes(compactName)
}

function addAssignments(
  target: Map<string, ExamClassAssignment>,
  rows: Array<Partial<ExamClassAssignment> & { subject_code: string; class: number }>,
) {
  rows.forEach(row => {
    const subjectCode = normalizeSubjectValue(row.subject_code)
    const classValue = Number(row.class)
    if (!subjectCode || !Number.isFinite(classValue)) return

    target.set(`${classValue}:${subjectCode}`, {
      subject_code: row.subject_code,
      class: classValue,
      is_fourth_subject: Boolean(row.is_fourth_subject),
      exclude_from_rank: Boolean(row.exclude_from_rank),
    })
  })
}

export function buildClassSubjectAssignments(
  rules: ExamSubjectRule[],
  tableRows: ExamClassAssignment[] = [],
): ExamClassAssignment[] {
  const assignments = new Map<string, ExamClassAssignment>()

  const ruleRows = rules.flatMap(rule => {
    if (!Array.isArray(rule.exam_class)) return []
    return rule.exam_class.map(entry => ({
      subject_code: rule.subject_code,
      class: Number(entry.class),
      is_fourth_subject: Boolean(entry.is_fourth_subject),
      exclude_from_rank: Boolean(entry.exclude_from_rank),
    }))
  })

  addAssignments(assignments, ruleRows)
  addAssignments(assignments, tableRows)

  return Array.from(assignments.values()).sort((a, b) => {
    const classDiff = a.class - b.class
    if (classDiff !== 0) return classDiff
    return normalizeSubjectValue(a.subject_code).localeCompare(normalizeSubjectValue(b.subject_code))
  })
}

export function buildClassSubjectFlags(assignments: ExamClassAssignment[]) {
  const flagsByClass: Record<number, ClassSubjectFlags> = {}

  assignments.forEach(assignment => {
    const classValue = Number(assignment.class)
    if (!Number.isFinite(classValue)) return

    const bucket = flagsByClass[classValue] ?? {
      subjectCodes: new Set<string>(),
      fourthSubjectCodes: new Set<string>(),
      excludeFromRankCodes: new Set<string>(),
    }

    const subjectCode = normalizeSubjectValue(assignment.subject_code)
    if (!subjectCode) return

    bucket.subjectCodes.add(subjectCode)
    if (assignment.is_fourth_subject) bucket.fourthSubjectCodes.add(subjectCode)
    if (assignment.exclude_from_rank) bucket.excludeFromRankCodes.add(subjectCode)
    flagsByClass[classValue] = bucket
  })

  return flagsByClass
}

export async function fetchAllRows<T>(
  getPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message?: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  let to = pageSize - 1

  while (true) {
    const { data, error } = await getPage(from, to)
    if (error) throw error
    if (!data || data.length === 0) break

    rows.push(...data)
    if (data.length < pageSize) break

    from += pageSize
    to += pageSize
  }

  return rows
}

export async function loadExamSubjectContext(examId: number) {
  const { data: rules, error } = await supabase
    .from('FMHS_exam_subjects')
    .select('*')
    .eq('exam_id', examId)
    .order('subject_code', { ascending: true })

  if (error) throw error

  let classRows: ExamClassAssignment[] = []
  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('FMHS_exam_class_subjects')
    .select('subject_code, class, is_fourth_subject, exclude_from_rank')
    .eq('exam_id', examId)

  if (!assignmentError && assignmentRows) {
    classRows = assignmentRows.map(row => ({
      subject_code: String(row.subject_code ?? '').trim(),
      class: Number(row.class) || 0,
      is_fourth_subject: Boolean(row.is_fourth_subject),
      exclude_from_rank: Boolean(row.exclude_from_rank),
    }))
  }

  const normalizedRules = (rules ?? []) as ExamSubjectRule[]
  return {
    rules: normalizedRules,
    classAssignments: buildClassSubjectAssignments(normalizedRules, classRows),
  }
}

export async function loadOptionalSubjectMapForExam(examId: number): Promise<Record<string, string>> {
  const iidRows = await fetchAllRows<{ iid: string | number | null }>((from, to) => (
    supabase
      .from('fmhs_exam_data')
      .select('iid')
      .eq('exam_id', examId)
      .range(from, to)
  ))

  const iids = iidRows
    .map(row => String(row.iid ?? '').trim())
    .filter(Boolean)

  const optMap: Record<string, string> = {}
  for (let i = 0; i < iids.length; i += 500) {
    const batch = iids.slice(i, i + 500)
    if (batch.length === 0) continue

    const { data, error } = await supabase
      .from('student_database')
      .select('iid, optional_subject')
      .in('iid', batch)

    if (error) throw error

    data?.forEach(row => {
      const iid = String(row.iid ?? '').trim()
      const optionalSubject = String(row.optional_subject ?? '').trim()
      if (iid && optionalSubject) optMap[iid] = optionalSubject
    })
  }

  return optMap
}