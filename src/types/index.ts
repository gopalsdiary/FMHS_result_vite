// ─── Auth ───────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string
  email: string
}

// ─── Student ─────────────────────────────────────────────────────────────────
export interface Student {
  id?: number
  IID: string
  student_name: string
  father_name?: string
  mother_name?: string
  access_section_2025: string
  roll?: string | number
  shift?: string
  gender?: string
  phone?: string
}

// ─── Subject ─────────────────────────────────────────────────────────────────
export interface Subject {
  id?: number
  access_section_2025: string
  access_subject: string
  subject_type?: string
  subject_order?: number
}

// ─── Grade / Mark ────────────────────────────────────────────────────────────
export interface GradeEntry {
  id?: number
  IID: string
  subject: string
  cq?: number | null
  mcq?: number | null
  practical?: number | null
  total?: number | null
  gpa?: number | null
  absent?: boolean
}

export interface StudentResult {
  IID: string
  student_name: string
  father_name?: string
  access_section_2025: string
  roll?: string | number
  total_mark?: number | null
  average_mark?: number | null
  gpa_final?: number | null
  class_rank?: number | null
  remark?: string | null
  absent?: boolean
  subjects?: GradeEntry[]
}

// ─── GPA / Grading criteria ───────────────────────────────────────────────────
export interface GradingCriteria {
  cqPass: number
  mcqPass: number
  practicalPass: number
  totalPass: number
  gradeAPlus: number
  gradeA: number
  gradeAMinus: number
  gradeB: number
  gradeC: number
  gradeD: number
}

// ─── Teacher ─────────────────────────────────────────────────────────────────
export interface Teacher {
  id?: number
  email: string
  name?: string
  assigned_subjects?: string[]
  assigned_sections?: string[]
}

// ─── SMS / Messaging ─────────────────────────────────────────────────────────
export interface SmsRecord {
  IID: string
  student_name: string
  phone?: string
  sms_text?: string
  gpa_final?: number | null
  remark?: string | null
}

// ─── Class / Section info ────────────────────────────────────────────────────
export type ClassSection = string   // e.g. "10A", "9B"

// ─── API helpers ─────────────────────────────────────────────────────────────
export interface SelectOption {
  value: string
  label: string
}
