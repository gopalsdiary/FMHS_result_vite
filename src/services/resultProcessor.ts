import { supabase } from './supabaseClient'

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
  const { data: rules } = await supabase.from('FMHS_exam_subjects').select('*').eq('exam_id', examId)
  if (!rules || rules.length === 0) throw new Error('No subject rules found for this exam.')

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
    let totalGPA = 0
    let subjectCount = 0
    let totalMarks = 0
    let failed = false

    rules.forEach(rule => {
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
      
      if (isFailed) failed = true
      totalGPA += isFailed ? 0 : gpa
      totalMarks += total
      subjectCount++
    })

    const finalGPA = failed ? 0 : (totalGPA / subjectCount)
    update.total_mark = totalMarks
    update.average_mark = totalMarks / subjectCount
    update.gpa_final = failed ? 'F' : finalGPA.toFixed(2)
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

