/**
 * Central configuration for the exam data table.
 * Previously, the system used the hardcoded 'exam_ann25' table.
 * Now everything goes through 'FMHS_exam_data' with exam_id filtering.
 * 
 * This file provides backward-compatible column name mappings.
 */

export const EXAM_TABLE = 'FMHS_exam_data'

/**
 * Column name mapping for the new unified table.
 * Old table used class_2025, section_2025, roll_2025 etc.
 * New table uses class, section, roll.
 */
export const COL = {
  iid: 'iid',
  class: 'class',
  section: 'section',
  roll: 'roll',
  studentName: 'student_name_en',
  fatherName: 'father_name_en',
  totalMark: 'total_mark',
  averageMark: 'average_mark',
  gpaFinal: 'gpa_final',
  countAbsent: 'count_absent',
  classRank: 'class_rank',
  remark: 'remark',
  status: 'status',
  examId: 'exam_id',
} as const

