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
  const { rules, classAssignments } = await loadExamSubjectContext(examId)
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
    const hasAssignments = classAssignments.subjectCodes.size > 0
    const assignedCodes = classAssignments.subjectCodes
    const fourthSubjectCodes = classAssignments.fourthSubjectCodes
    const excludeFromRankCodes = classAssignments.excludeFromRankCodes

    let totalGPA = 0
    let gpaSubjectsCount = 0
    let totalMarks = 0
    let validSubjects = 0
    let attendedSubjects = 0 // excludes 4th subject
    let failCount = 0
    let expectedMainSubjects = 0

    rules.forEach(rule => {
      // If class assignments exist, skip subjects not assigned to this class
      const subjectCode = normalizeSubjectValue(rule.subject_code)
      if (hasAssignments && !assignedCodes.has(subjectCode)) return

      const isClassFourthSubject = fourthSubjectCodes.has(subjectCode)
      const isExcludedFromRank = excludeFromRankCodes.has(subjectCode)
      
      // It is ONLY this student's 4th subject if it matches their optional_subject
      const isStudentFourthSubject = isClassFourthSubject && subjectMatchesOptional(studentOptionalSubject, rule)

      // If it's not excluded from rank, and NOT this student's 4th subject, it is a main subject for them
      if (!isExcludedFromRank && !isStudentFourthSubject) {
        expectedMainSubjects++
      }

      const base = `*${rule.subject_name}`
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
        if (!isExcludedFromRank) {
          totalMarks += total
          validSubjects++
          if (!isStudentFourthSubject) attendedSubjects++
        }
      }

      // GPA calculation with 4th subject handling
      if (!isExcludedFromRank) {
        let effectiveGpa = isFailed ? 0 : gpa
        if (isStudentFourthSubject && effectiveGpa > 0) {
          effectiveGpa = Math.max(0, effectiveGpa - 2)
        }
        totalGPA += effectiveGpa
        
        // If it's the 4th subject, it shouldn't increase the divisor for GPA average calculation
        // Wait! In Bangladesh, the 4th subject GPA is ADDED, but the subject is NOT counted in the divisor!
        // The divisor is ONLY the main subjects!
        if (!isStudentFourthSubject) {
          gpaSubjectsCount++
          if (effectiveGpa <= 0) failCount++ // Fail in 4th subject doesn't count as total fail
        }
      }
    })

    // Calculate expected subject count for this class
    let totalSubjectCount = hasAssignments ? expectedMainSubjects : rules.length

    const countAbsent = Math.max(0, totalSubjectCount - attendedSubjects)
    const avgCalc = validSubjects > 0 ? Math.round(totalMarks / validSubjects) : 0

    let gpaFinal: string | number | null = null
    if ((failCount + countAbsent) > 0) {
      gpaFinal = null
    } else if (gpaSubjectsCount > 0) {
      const divisor = totalSubjectCount > 0 ? totalSubjectCount : gpaSubjectsCount
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
  // Bulk update (Supabase handles this via array of objects with primary keys)
  const { error } = await supabase.from('fmhs_exam_data').upsert(updates)
  if (error) throw error

  onProgress?.('✅ All results processed successfully!')
  return updates.length
}

