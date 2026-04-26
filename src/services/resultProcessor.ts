import { supabase } from './supabaseClient'
import {
  buildClassSubjectFlags,
  loadExamSubjectContext,
  loadOptionalSubjectMapForExam,
  normalizeSubjectValue,
  subjectMatchesOptional,
} from './examResultContext'

export interface SubjectRule {
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
}

/**
 * Grade calculation based on national standards
 */
export function getGrade(total: number, fullMarks: number = 100): { gpa: number, grade: string } {
  // Normalize to 100 if full marks are different
  const percentage = (total / fullMarks) * 100

  if (percentage >= 80) return { gpa: 5.0, grade: 'A+' }
  if (percentage >= 70) return { gpa: 4.0, grade: 'A' }
  if (percentage >= 60) return { gpa: 3.5, grade: 'A-' }
  if (percentage >= 50) return { gpa: 3.0, grade: 'B' }
  if (percentage >= 40) return { gpa: 2.0, grade: 'C' }
  if (percentage >= 33) return { gpa: 1.0, grade: 'D' }
  return { gpa: 0.0, grade: 'F' }
}

/**
 * Main function to process all marks for an exam
 */
export async function processExamResults(examId: number, onProgress?: (msg: string) => void) {
  onProgress?.('Fetching subject rules...')
  const { rules, classAssignments, classConfigs } = await loadExamSubjectContext(examId)
  if (!rules || rules.length === 0) throw new Error('No subject rules found for this exam.')
  const classSubjectInfo = buildClassSubjectFlags(classAssignments)

  // Load optional_subject from student_database
  onProgress?.('Fetching student optional subjects...')
  const optMap = await loadOptionalSubjectMapForExam(examId)

  onProgress?.('Fetching student data...')
  let students: any[] = []
  let from = 0
  let to = 999
  let hasMore = true
  while (hasMore) {
    const { data, error } = await supabase.from('fmhs_exam_data').select('*').eq('exam_id', examId).range(from, to)
    if (error) throw error
    if (data && data.length > 0) {
      students = [...students, ...data]
      if (data.length < 1000) hasMore = false
      else { from += 1000; to += 1000 }
    } else {
      hasMore = false
    }
  }
  if (students.length === 0) throw new Error('No students found in this exam session.')

  onProgress?.(`Processing ${students.length} students...`)
  
  const updates = students.map(student => {
    const update: any = { id: student.id }
    const studentClass = Number(student.class) || 0
    const studentIid = String(student.iid ?? '')
    const studentOptionalSubject = optMap[studentIid] || ''

    // Get class-specific assignments
    const classAssignments = classSubjectInfo[studentClass] ?? {
      subjectCodes: new Set<string>(),
      fourthSubjectCodes: new Set<string>(),
      excludeFromRankCodes: new Set<string>(),
    }
    const fourthSubjectCodes = classAssignments.fourthSubjectCodes
    const excludeFromRankCodes = classAssignments.excludeFromRankCodes

    let totalGPA = 0
    let gpaSubjectsCount = 0
    let totalMarks = 0
    let validSubjects = 0
    let attendedMainSubjects = 0 
    let failCount = 0
    let expectedMainSubjects = 0

    rules.forEach(rule => {
      const subjectCode = normalizeSubjectValue(rule.subject_code)
      
      // 1. Verify if this SPECIFIC rule applies to the student's class and section
      const classConfig = (rule as any).exam_class?.find((c: any) => Number(c.class) === studentClass && c.selected)
      if (!classConfig) return

      // 2. Section/Group Filtering: 
      // If the rule specifies sections, only apply to those. If empty, apply to all.
      const restrictedSections = classConfig.sections || []
      if (restrictedSections.length > 0 && !restrictedSections.includes(student.section)) {
        return // This subject doesn't belong to this student's section/group
      }

      const isClassFourth = fourthSubjectCodes.has(subjectCode)
      const isExcluded = excludeFromRankCodes.has(subjectCode)
      const isStudentFourth = isClassFourth && subjectMatchesOptional(studentOptionalSubject, rule)

      // It is an expected main subject if it's assigned to class, not excluded, and not the student's 4th subject
      if (!isExcluded && !isStudentFourth) {
        expectedMainSubjects++
      }

      const base = `*${rule.subject_name.trim()}`
      const cq = Number(student[`${base}_CQ`]) || 0
      const mcq = Number(student[`${base}_MCQ`]) || 0
      const prac = Number(student[`${base}_Practical`]) || 0
      const total = cq + mcq + prac

      // Check for failure in individual components
      const isFailed = (rule.pass_cq > 0 && cq < rule.pass_cq) ||
                       (rule.pass_mcq > 0 && mcq < rule.pass_mcq) ||
                       (rule.pass_practical > 0 && prac < rule.pass_practical) ||
                       (total < rule.pass_total)

      const { gpa, grade } = getGrade(total, rule.full_marks)
      
      update[`${base}_Total`] = total
      update[`${base}_GPA`] = isFailed ? 'F' : grade

      if (total > 0) {
        if (!isExcluded) {
          totalMarks += total
          validSubjects++
          if (!isStudentFourth) {
            attendedMainSubjects++
          }
        }
      }

      // GPA calculation with 4th subject handling
      if (!isExcluded) {
        let effectiveGpa = isFailed ? 0 : gpa
        if (isStudentFourth && effectiveGpa > 0) {
          effectiveGpa = Math.max(0, effectiveGpa - 2)
        }
        totalGPA += effectiveGpa
        
        if (!isStudentFourth) {
          gpaSubjectsCount++
          if (effectiveGpa <= 0) failCount++
        }
      }
    })

    const countAbsent = Math.max(0, expectedMainSubjects - attendedMainSubjects)
    const avgCalc = validSubjects > 0 ? Math.round(totalMarks / validSubjects) : 0

    let gpaFinal: string | number | null = null
    if ((failCount + countAbsent) > 0) {
      gpaFinal = null
    } else if (gpaSubjectsCount > 0) {
      // Use manual divisor if provided, otherwise fallback to dynamic count
      const manualDivisor = classConfigs[studentClass]
      const divisor = (manualDivisor && manualDivisor > 0) ? manualDivisor : gpaSubjectsCount
      
      const raw = Math.min(5, totalGPA / divisor)
      gpaFinal = isNaN(raw) ? null : parseFloat(raw.toFixed(2))
    }

    update.total_mark = totalMarks || null
    update.average_mark = avgCalc || null
    update.count_absent = countAbsent > 0 ? String(countAbsent) : null
    update.gpa_final = gpaFinal
    update.remark = failCount > 0 ? `fail: ${failCount}` : null
    update.status = 'Processed'
    
    return update
  })

  onProgress?.('Saving results to database...')
  const { error } = await supabase.from('fmhs_exam_data').upsert(updates)
  if (error) throw error

  onProgress?.('✅ All results processed successfully!')
  return updates.length
}
