import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'

interface Exam {
  id: number
  exam_name: string
  year?: number
}

interface Assignment {
  id?: number
  exam_id: number
  teacher_email_id: string
  teacher_name_en: string
  teacher_name_bn?: string
  class: number
  section: string
  subject_name: string
  subject_code: string
  comment?: string
}

interface TeacherGroup {
  email: string
  nameEn: string
  nameBn?: string
  totalSubjects: number
  assignments: Assignment[]
}

export default function TeacherAccessListPage() {
  const { examId } = useParams()
  const navigate = useNavigate()

  const [exams, setExams] = useState<Exam[]>([])
  const [selectedExamId, setSelectedExamId] = useState<string>(examId || '')
  const [examName, setExamName] = useState<string>('')
  
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Load all exams for dropdown selection
  useEffect(() => {
    async function loadExams() {
      const { data } = await supabase
        .from('FMHS_exams_names')
        .select('id, exam_name, year')
        .order('id', { ascending: false })

      if (data && data.length > 0) {
        setExams(data)
        if (!selectedExamId) {
          setSelectedExamId(String(data[0].id))
        }
      }
    }
    loadExams()
  }, [])

  // Sync selectedExamId if param changes
  useEffect(() => {
    if (examId) {
      setSelectedExamId(examId)
    }
  }, [examId])

  // Load assignments whenever selectedExamId changes
  useEffect(() => {
    if (!selectedExamId) return
    loadData(Number(selectedExamId))
  }, [selectedExamId])

  async function loadData(targetExamId: number) {
    setLoading(true)
    
    // 1. Get Exam Details
    const { data: exData } = await supabase
      .from('FMHS_exams_names')
      .select('exam_name')
      .eq('id', targetExamId)
      .single()
    
    if (exData) {
      setExamName(exData.exam_name)
    } else {
      setExamName('')
    }

    // 2. Fetch subject rules from FMHS_exam_subjects to enforce class & section constraints
    const { data: rulesData } = await supabase
      .from('FMHS_exam_subjects')
      .select('*')
      .eq('exam_id', targetExamId)

    interface SubjectRuleConstraint {
      class: number
      subject_code: string
      sections: string[]
    }

    const parsedRules: SubjectRuleConstraint[] = []
    if (rulesData && rulesData.length > 0) {
      rulesData.forEach(r => {
        const clsList = (r.exam_class || []) as any[]
        clsList?.forEach(c => {
          if (c.selected) {
            parsedRules.push({
              class: Number(c.class),
              subject_code: String(r.subject_code),
              sections: Array.isArray(c.sections) ? c.sections : []
            })
          }
        })
      })
    }

    // 3. Get assignments from FMHS_exam_teacher_selection
    const { data: assignData, error } = await supabase
      .from('FMHS_exam_teacher_selection')
      .select('*')
      .eq('exam_id', targetExamId)
      .order('teacher_name_en')

    if (error) {
      console.error('Error fetching teacher access list:', error)
    }

    let rawAssignments = (assignData ?? []) as Assignment[]

    // Filter assignments against configured class & section subject rules
    if (parsedRules.length > 0) {
      rawAssignments = rawAssignments.filter(a => {
        const rule = parsedRules.find(r => r.class === Number(a.class) && String(r.subject_code) === String(a.subject_code))
        if (!rule) return false // Subject not allowed for this class
        if (rule.sections && rule.sections.length > 0) {
          return rule.sections.includes(a.section) // Section must be in allowed sections list
        }
        return true
      })
    }

    setAssignments(rawAssignments)
    setLoading(false)
  }

  // Group assignments by teacher email / teacher name
  const teacherMap: Record<string, TeacherGroup> = {}

  assignments.forEach((assign) => {
    const key = assign.teacher_email_id || assign.teacher_name_en || 'Unknown Teacher'
    if (!teacherMap[key]) {
      teacherMap[key] = {
        email: assign.teacher_email_id,
        nameEn: assign.teacher_name_en || 'Unnamed Teacher',
        nameBn: assign.teacher_name_bn || '',
        totalSubjects: 0,
        assignments: [],
      }
    }
    teacherMap[key].assignments.push(assign)
    teacherMap[key].totalSubjects += 1
  })

  // Convert map to array and sort by teacher name
  const teacherGroups: TeacherGroup[] = Object.values(teacherMap).sort((a, b) =>
    a.nameEn.localeCompare(b.nameEn)
  )

  // Filter based on search query
  const filteredGroups = teacherGroups.filter((group) => {
    const query = searchQuery.toLowerCase()
    const matchesTeacher =
      group.nameEn.toLowerCase().includes(query) ||
      group.nameBn?.toLowerCase().includes(query) ||
      group.email.toLowerCase().includes(query)

    const matchesAssignment = group.assignments.some(
      (a) =>
        a.subject_name.toLowerCase().includes(query) ||
        a.subject_code.toLowerCase().includes(query) ||
        String(a.class).includes(query) ||
        a.section.toLowerCase().includes(query)
    )

    return matchesTeacher || matchesAssignment
  })

  const totalAssignedTeachers = teacherGroups.length
  const totalAssignedSubjects = assignments.length

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        fontFamily: "'Aneek Bangla', 'Outfit', system-ui, sans-serif",
        color: '#1e293b',
      }}
    >
      {/* Header Bar */}
      <header
        className="no-print"
        style={{
          background: '#ffffff',
          padding: '16px 32px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() =>
              selectedExamId ? navigate(`/exam-teachers/${selectedExamId}`) : navigate(-1)
            }
            style={{
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#475569',
              borderRadius: '10px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            ← Back to Teacher Setup
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>
              📋 Teacher Access List (শিক্ষক বিষয় একসেস তালিকা)
            </h1>
            <p style={{ margin: 0, fontSize: '12px', color: '#ec4899', fontWeight: 800 }}>
              {examName ? examName.toUpperCase() : 'EXAM TEACHER ASSIGNMENTS'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Exam Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Exam:</label>
            <select
              value={selectedExamId}
              onChange={(e) => {
                setSelectedExamId(e.target.value)
                navigate(`/teacher_access_list/${e.target.value}`)
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                background: '#fff',
                fontSize: '13px',
                fontWeight: 700,
                color: '#0f172a',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.exam_name} {ex.year ? `(${ex.year})` : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => window.print()}
            style={{
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
            }}
          >
            🖨️ Print List
          </button>
        </div>
      </header>

      <main style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Printable Title for Print Mode */}
        <div className="only-print" style={{ display: 'none', textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px 0' }}>
            Teacher Access List - {examName}
          </h2>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
            Generated on: {new Date().toLocaleDateString('bn-BD')} | Total Teachers: {totalAssignedTeachers}
          </p>
        </div>

        {/* Top Summary Stats & Search */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '20px',
          }}
        >
          {/* Summary Badges */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '10px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#e0f2fe',
                  color: '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '16px',
                }}
              >
                👨‍🏫
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                  মোট শিক্ষক (Total Teachers)
                </div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                  {totalAssignedTeachers} জন
                </div>
              </div>
            </div>

            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '10px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#f0fdf4',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '16px',
                }}
              >
                📚
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                  মোট বরাদ্দকৃত বিষয় (Total Assignments)
                </div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                  {totalAssignedSubjects} টি
                </div>
              </div>
            </div>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: '320px' }}>
            <input
              type="text"
              placeholder="🔍 Search teacher, class, section, subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 16px',
                paddingRight: '36px',
                borderRadius: '12px',
                border: '1.5px solid #cbd5e1',
                fontSize: '13px',
                outline: 'none',
                background: '#ffffff',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 800,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Content Table Container */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1.5px solid #cbd5e1',
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
          }}
        >
          {loading ? (
            <div
              style={{
                padding: '60px',
                textAlign: 'center',
                color: '#64748b',
                fontWeight: 600,
              }}
            >
              ⏳ Loading teacher access list...
            </div>
          ) : filteredGroups.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔍</div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#334155' }}>
                {searchQuery ? 'No matching assignments found' : 'No Teacher Assignments Configured'}
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>
                {searchQuery
                  ? 'Try searching with a different keyword.'
                  : 'Assign teachers to subjects in the Teacher Setup page.'}
              </p>
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                  <th
                    style={{
                      padding: '12px 18px',
                      fontWeight: 800,
                      color: '#1e293b',
                      fontSize: '13px',
                      width: '32%',
                      borderRight: '1.5px solid #cbd5e1',
                    }}
                  >
                    शिक्षকের নাম (Teacher Name)
                  </th>
                  <th
                    style={{
                      padding: '12px 18px',
                      fontWeight: 800,
                      color: '#1e293b',
                      fontSize: '13px',
                      width: '28%',
                      borderRight: '1.5px solid #cbd5e1',
                    }}
                  >
                    ক্লাস - সেকশন (Class - Section)
                  </th>
                  <th
                    style={{
                      padding: '12px 18px',
                      fontWeight: 800,
                      color: '#1e293b',
                      fontSize: '13px',
                      width: '40%',
                    }}
                  >
                    বিষয় (Subject)
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((group, groupIdx) => {
                  const isEvenGroup = groupIdx % 2 === 0
                  const groupBg = isEvenGroup ? '#ffffff' : '#f8fafc'

                  return group.assignments.map((assign, assignIdx) => {
                    const isFirstInGroup = assignIdx === 0
                    const isLastInGroup = assignIdx === group.assignments.length - 1

                    return (
                      <tr
                        key={`${group.email || group.nameEn}-${assignIdx}`}
                        style={{
                          background: groupBg,
                          borderBottom: isLastInGroup
                            ? '2px solid #cbd5e1'
                            : '1px solid #e2e8f0',
                        }}
                      >
                        {/* Column 1: शिक्षকের নাম (Teacher Name) with RowSpan for first row in group */}
                        {isFirstInGroup && (
                          <td
                            rowSpan={group.assignments.length}
                            style={{
                              padding: '14px 18px',
                              verticalAlign: 'top',
                              borderRight: '1.5px solid #cbd5e1',
                              background: groupBg,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 800,
                                  fontSize: '14px',
                                  color: '#0f172a',
                                }}
                              >
                                {group.nameEn}
                              </div>
                              {group.nameBn && (
                                <div
                                  style={{
                                    fontSize: '12px',
                                    color: '#475569',
                                    fontWeight: 600,
                                  }}
                                >
                                  {group.nameBn}
                                </div>
                              )}
                              {group.email && (
                                <div
                                  style={{
                                    fontSize: '11px',
                                    color: '#94a3b8',
                                    fontWeight: 500,
                                  }}
                                >
                                  {group.email}
                                </div>
                              )}
                              {/* Total Subjects Badge */}
                              <div style={{ marginTop: '6px' }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: '#0284c7',
                                    color: '#ffffff',
                                    padding: '3px 10px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    letterSpacing: '0.02em',
                                  }}
                                >
                                  📚 মোট {group.totalSubjects} টি বিষয়
                                </span>
                              </div>
                            </div>
                          </td>
                        )}

                        {/* Column 2: ক্লাস - সেকশন (Class - Section) */}
                        <td
                          style={{
                            padding: '12px 18px',
                            verticalAlign: 'middle',
                            borderRight: '1.5px solid #cbd5e1',
                            fontWeight: 700,
                            color: '#1e293b',
                          }}
                        >
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '12px',
                            }}
                          >
                            <span>🏫 Class {assign.class}</span>
                            <span style={{ color: '#94a3b8' }}>•</span>
                            <span style={{ color: '#0284c7', fontWeight: 800 }}>
                              Section {assign.section}
                            </span>
                          </div>
                        </td>

                        {/* Column 3: বিষয় (Subject) with serial number */}
                        <td
                          style={{
                            padding: '12px 18px',
                            verticalAlign: 'middle',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                            }}
                          >
                            {/* Serial Number Badge */}
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                background: '#3b82f6',
                                color: '#ffffff',
                                fontSize: '11px',
                                fontWeight: 800,
                                flexShrink: 0,
                              }}
                            >
                              {assignIdx + 1}
                            </span>
                            <div>
                              <span
                                style={{
                                  fontWeight: 800,
                                  color: '#0f172a',
                                  fontSize: '13px',
                                }}
                              >
                                {assign.subject_name}
                              </span>
                              {assign.subject_code && (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    color: '#64748b',
                                    marginLeft: '6px',
                                    fontWeight: 600,
                                  }}
                                >
                                  (Code: {assign.subject_code})
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Print Styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .only-print {
            display: block !important;
          }
          body {
            background: #ffffff !important;
          }
          main {
            padding: 0 !important;
            max-width: 100% !important;
          }
          table {
            border: 1px solid #000 !important;
          }
          th, td {
            border-color: #000 !important;
          }
        }
      `}</style>
    </div>
  )
}
