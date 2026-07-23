import { useEffect, useState, useMemo } from 'react'
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

interface AssignmentProgress {
  enteredCount: number
  totalStudents: number
  percentage: number
}

export default function TeacherAccessListPage() {
  const { examId } = useParams()
  const navigate = useNavigate()

  const [exams, setExams] = useState<Exam[]>([])
  const [selectedExamId, setSelectedExamId] = useState<string>(examId || '')
  const [examName, setExamName] = useState<string>('')
  
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [studentRows, setStudentRows] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [filterUnder50, setFilterUnder50] = useState<boolean>(false)

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

  // Load assignments & student data whenever selectedExamId changes
  useEffect(() => {
    if (!selectedExamId) return
    loadData(Number(selectedExamId))
  }, [selectedExamId])

  async function loadData(targetExamId: number) {
    setLoading(true)
    const startTime = Date.now()
    
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

    // 4. Fetch student records in FMHS_exam_data for entry progress calculation
    const { data: eRows } = await supabase
      .from('FMHS_exam_data')
      .select('*')
      .eq('exam_id', targetExamId)
      .range(0, 4999)

    setStudentRows(eRows || [])

    // Ensure minimum 5 seconds (5000ms) loading state
    const elapsed = Date.now() - startTime
    const remainingDelay = Math.max(0, 5000 - elapsed)

    setTimeout(() => {
      setLoading(false)
    }, remainingDelay)
  }

  // Pre-calculate mark entry stats for all assignments
  const progressMap = useMemo(() => {
    const map = new Map<string, AssignmentProgress>()
    if (studentRows.length === 0 || assignments.length === 0) return map

    // Helper: Find matching column keys in studentRows for a subject
    const sampleRow = studentRows[0] || {}
    const keys = Object.keys(sampleRow)

    assignments.forEach(assign => {
      const keyId = `${assign.class}-${assign.section}-${assign.subject_code}`
      if (map.has(keyId)) return

      const targetClass = Number(assign.class)
      const targetSection = String(assign.section || '').trim().toLowerCase()

      const classSecStudents = studentRows.filter(s => 
        Number(s.class) === targetClass && 
        String(s.section || '').trim().toLowerCase() === targetSection
      )

      const totalStudents = classSecStudents.length
      if (totalStudents === 0) {
        map.set(keyId, { enteredCount: 0, totalStudents: 0, percentage: 0 })
        return
      }

      const normName = String(assign.subject_name || '').replace(/^\*+/, '').trim().toLowerCase()
      const compactName = normName.replace(/[^a-z0-9]/g, '')
      const normCode = String(assign.subject_code || '').trim().toLowerCase()
      const exactPrefix = `*${String(assign.subject_name || '').replace(/^\*+/, '').trim()}_`.toLowerCase()

      const matchingKeys = keys.filter(k => {
        const kLower = k.toLowerCase()
        if (['id', 'exam_id', 'iid', 'class', 'section', 'roll', 'name', 'student_name', 'father_name', 'mother_name', 'gpa_final', 'total_mark', 'gpa', 'grade', 'remark', 'rank', 'created_at', 'updated_at', 'optional_subject'].includes(kLower)) {
          return false
        }
        if (kLower.startsWith(exactPrefix)) return true
        const kClean = kLower.replace(/^\*+/, '').trim()
        const compactKey = kClean.replace(/[^a-z0-9]/g, '')
        return (
          kClean.includes(normName) ||
          (compactName && compactKey.includes(compactName)) ||
          (normCode && normCode.length >= 2 && (kClean.includes(normCode) || compactKey.includes(normCode)))
        )
      })

      if (matchingKeys.length === 0) {
        map.set(keyId, { enteredCount: 0, totalStudents, percentage: 0 })
        return
      }

      let enteredCount = 0
      classSecStudents.forEach(student => {
        let hasVal = false
        for (const mk of matchingKeys) {
          const val = student[mk]
          if (val !== null && val !== undefined && String(val).trim() !== '' && String(val).trim() !== 'NaN') {
            hasVal = true
            break
          }
        }
        if (hasVal) enteredCount++
      })

      const percentage = Math.round((enteredCount / totalStudents) * 100)
      map.set(keyId, { enteredCount, totalStudents, percentage })
    })

    return map
  }, [assignments, studentRows])

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

  // Count assignments under 50% entry
  const under50Count = useMemo(() => {
    return assignments.filter(a => {
      const keyId = `${a.class}-${a.section}-${a.subject_code}`
      const prog = progressMap.get(keyId)
      const pct = prog ? prog.percentage : 0
      return pct < 50
    }).length
  }, [assignments, progressMap])

  // Filter based on search query and < 50% filter
  const filteredGroups = teacherGroups
    .map((group) => {
      const query = searchQuery.toLowerCase()
      const matchesTeacherName =
        group.nameEn.toLowerCase().includes(query) ||
        group.nameBn?.toLowerCase().includes(query) ||
        group.email.toLowerCase().includes(query)

      const matchingAssignments = group.assignments.filter((a) => {
        const keyId = `${a.class}-${a.section}-${a.subject_code}`
        const prog = progressMap.get(keyId) || { enteredCount: 0, totalStudents: 0, percentage: 0 }

        const matchesSearch =
          !query ||
          matchesTeacherName ||
          a.subject_name.toLowerCase().includes(query) ||
          a.subject_code.toLowerCase().includes(query) ||
          String(a.class).includes(query) ||
          a.section.toLowerCase().includes(query)

        if (!matchesSearch) return false

        if (filterUnder50) {
          return prog.percentage < 50
        }

        return true
      })

      return {
        ...group,
        assignments: matchingAssignments,
      }
    })
    .filter((group) => group.assignments.length > 0)

  const totalAssignedTeachers = teacherGroups.length
  const totalAssignedSubjects = assignments.length

  // Calculate Overall Progress
  let grandTotalStudents = 0
  let grandEnteredStudents = 0
  assignments.forEach(assign => {
    const keyId = `${assign.class}-${assign.section}-${assign.subject_code}`
    const prog = progressMap.get(keyId)
    if (prog) {
      grandTotalStudents += prog.totalStudents
      grandEnteredStudents += prog.enteredCount
    }
  })

  const grandPercentage = grandTotalStudents > 0 ? Math.round((grandEnteredStudents / grandTotalStudents) * 100) : 0

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        fontFamily: "'Aneek Bangla', 'Outfit', system-ui, sans-serif",
        color: '#0f172a',
      }}
    >
      {/* ── POPUP LOADING MODAL ── */}
      {loading && (
        <div
          className="no-print"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              padding: '36px 40px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.1)',
              textAlign: 'center',
              maxWidth: '400px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              animation: 'popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Animated Glowing Dual Ring Spinner */}
            <div style={{ position: 'relative', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div
                style={{
                  position: 'absolute',
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  border: '4px solid transparent',
                  borderTopColor: '#0284c7',
                  borderRightColor: '#38bdf8',
                  animation: 'spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  border: '3px solid transparent',
                  borderBottomColor: '#6366f1',
                  borderLeftColor: '#818cf8',
                  animation: 'spinReverse 1s linear infinite',
                }}
              />
              <span style={{ fontSize: '22px' }}>📊</span>
            </div>

            <div>
              <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                তথ্যাদি প্রস্তুত করা হচ্ছে...
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: 600, lineHeight: 1.4 }}>
                শিক্ষক বিষয় একসেস তালিকা ও এন্ট্রি প্রোগ্রেস লোড হচ্ছে
              </p>
            </div>

            {/* Shimmering Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '4px',
                background: '#f1f5f9',
                borderRadius: '999px',
                overflow: 'hidden',
                position: 'relative',
                marginTop: '4px',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  height: '100%',
                  width: '40%',
                  background: 'linear-gradient(90deg, #0284c7, #6366f1)',
                  borderRadius: '999px',
                  animation: 'loadingProgress 1.6s ease-in-out infinite',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Header Bar - Compact */}
      <header
        className="no-print"
        style={{
          background: '#ffffff',
          padding: '10px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          boxShadow: '0 1px 6px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() =>
              selectedExamId ? navigate(`/exam-teachers/${selectedExamId}`) : navigate(-1)
            }
            style={{
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#334155',
              borderRadius: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            ← Back to Teacher Setup
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
              📋 Teacher Access & Progress List (শিক্ষক বিষয় ও এন্ট্রি তালিকা)
            </h1>
            <p style={{ margin: 0, fontSize: '11px', color: '#db2777', fontWeight: 700 }}>
              {examName ? examName.toUpperCase() : 'EXAM TEACHER ASSIGNMENTS'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Exam Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>Exam:</label>
            <select
              value={selectedExamId}
              onChange={(e) => {
                setSelectedExamId(e.target.value)
                navigate(`/teacher_access_list/${e.target.value}`)
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                background: '#fff',
                fontSize: '12px',
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
              padding: '6px 14px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.2)',
            }}
          >
            🖨️ Print List
          </button>
        </div>
      </header>

      <main style={{ padding: '16px 20px', maxWidth: '1440px', margin: '0 auto' }}>
        {/* Printable Title for Print Mode */}
        <div className="only-print" style={{ display: 'none', textAlign: 'center', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 2px 0' }}>
            Teacher Access & Mark Entry Progress List - {examName}
          </h2>
          <p style={{ fontSize: '11px', color: '#64748b', margin: 0 }}>
            Generated on: {new Date().toLocaleDateString('bn-BD')} | Total Teachers: {totalAssignedTeachers} | Total Assignments: {totalAssignedSubjects} | Overall Progress: {grandEnteredStudents}/{grandTotalStudents} ({grandPercentage}%)
          </p>
        </div>

        {/* Top Summary Stats & Search - Compact */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '14px',
          }}
        >
          {/* Summary Badges */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Total Teachers */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
              }}
            >
              <span style={{ fontSize: '14px' }}>👨‍🏫</span>
              <div>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, display: 'block', lineHeight: 1 }}>
                  মোট শিক্ষক
                </span>
                <span style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>
                  {totalAssignedTeachers} জন
                </span>
              </div>
            </div>

            {/* Total Subjects */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
              }}
            >
              <span style={{ fontSize: '14px' }}>📚</span>
              <div>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, display: 'block', lineHeight: 1 }}>
                  মোট বরাদ্দকৃত বিষয়
                </span>
                <span style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>
                  {totalAssignedSubjects} টি
                </span>
              </div>
            </div>

            {/* Overall Mark Entry Progress */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
              }}
            >
              <span style={{ fontSize: '14px' }}>📈</span>
              <div>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, display: 'block', lineHeight: 1 }}>
                  মোট এন্ট্রি অগ্রগতি
                </span>
                <span style={{ fontSize: '14px', fontWeight: 900, color: '#059669' }}>
                  {grandEnteredStudents} / {grandTotalStudents} ({grandPercentage}%)
                </span>
              </div>
            </div>

            {/* Filter Button: < 50% Mark Entry */}
            <button
              onClick={() => setFilterUnder50(!filterUnder50)}
              style={{
                background: filterUnder50 ? '#fef2f2' : '#ffffff',
                color: filterUnder50 ? '#991b1b' : '#334155',
                border: filterUnder50 ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                borderRadius: '10px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: filterUnder50 ? '0 2px 8px rgba(239, 68, 68, 0.2)' : '0 1px 4px rgba(0,0,0,0.02)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <span style={{ fontSize: '14px' }}>⚠️</span>
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: '10px', color: filterUnder50 ? '#b91c1c' : '#64748b', fontWeight: 700, display: 'block', lineHeight: 1 }}>
                  {filterUnder50 ? 'ফিল্টার চালু' : 'ফিল্টার বাটন'}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 900 }}>
                  ৫০% এর নিচে এন্ট্রি ({under50Count}টি)
                </span>
              </div>
              {filterUnder50 && (
                <span
                  style={{
                    background: '#ef4444',
                    color: '#ffffff',
                    borderRadius: '50%',
                    width: '16px',
                    height: '16px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    fontWeight: 900,
                  }}
                >
                  ✓
                </span>
              )}
            </button>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: '280px' }}>
            <input
              type="text"
              placeholder="🔍 Search teacher, class, subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px',
                paddingRight: '32px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '12px',
                outline: 'none',
                background: '#ffffff',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 800,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Compressed Content Table Container */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1.5px solid #cbd5e1',
            overflow: 'hidden',
            boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
          }}
        >
          {filteredGroups.length === 0 && !loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>
                {filterUnder50 ? '🎉' : '🔍'}
              </div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#334155' }}>
                {filterUnder50
                  ? '৫০% এর নিচে এন্ট্রি বাকি এমন কোনো বিষয় নেই!'
                  : searchQuery
                  ? 'No matching assignments found'
                  : 'No Teacher Assignments Configured'}
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                {filterUnder50
                  ? 'সব বিষয়গুলোর এন্ট্রি ৫০% বা তার বেশি সম্পন্ন হয়েছে।'
                  : searchQuery
                  ? 'Try searching with a different keyword.'
                  : 'Assign teachers to subjects in the Teacher Setup page.'}
              </p>
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px',
                textAlign: 'left',
              }}
            >
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                  <th
                    style={{
                      padding: '8px 12px',
                      fontWeight: 800,
                      color: '#1e293b',
                      fontSize: '12px',
                      width: '26%',
                      borderRight: '1.5px solid #cbd5e1',
                    }}
                  >
                    शिक्षকের নাম (Teacher Name)
                  </th>
                  <th
                    style={{
                      padding: '8px 12px',
                      fontWeight: 800,
                      color: '#1e293b',
                      fontSize: '12px',
                      width: '20%',
                      borderRight: '1.5px solid #cbd5e1',
                    }}
                  >
                    ক্লাস - সেকশন (Class - Section)
                  </th>
                  <th
                    style={{
                      padding: '8px 12px',
                      fontWeight: 800,
                      color: '#1e293b',
                      fontSize: '12px',
                      width: '28%',
                      borderRight: '1.5px solid #cbd5e1',
                    }}
                  >
                    বিষয় (Subject)
                  </th>
                  <th
                    style={{
                      padding: '8px 12px',
                      fontWeight: 800,
                      color: '#1e293b',
                      fontSize: '12px',
                      width: '26%',
                    }}
                  >
                    মার্ক এন্ট্রি অগ্রগতি (Entry Status)
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

                    // Progress calculations for this specific assignment
                    const keyId = `${assign.class}-${assign.section}-${assign.subject_code}`
                    const prog = progressMap.get(keyId) || { enteredCount: 0, totalStudents: 0, percentage: 0 }

                    // Color badge logic
                    let badgeBg = '#f1f5f9'
                    let badgeColor = '#64748b'
                    let barColor = '#cbd5e1'

                    if (prog.totalStudents > 0) {
                      if (prog.percentage === 100) {
                        badgeBg = '#dcfce7'
                        badgeColor = '#15803d'
                        barColor = '#22c55e'
                      } else if (prog.percentage >= 50) {
                        badgeBg = '#e0f2fe'
                        badgeColor = '#0369a1'
                        barColor = '#0284c7'
                      } else if (prog.percentage > 0) {
                        badgeBg = '#fef3c7'
                        badgeColor = '#b45309'
                        barColor = '#f59e0b'
                      } else {
                        badgeBg = '#fee2e2'
                        badgeColor = '#b91c1c'
                        barColor = '#ef4444'
                      }
                    }

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
                        {/* Column 1: Teacher Name with RowSpan */}
                        {isFirstInGroup && (
                          <td
                            rowSpan={group.assignments.length}
                            style={{
                              padding: '8px 12px',
                              verticalAlign: 'top',
                              borderRight: '1.5px solid #cbd5e1',
                              background: groupBg,
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div
                                style={{
                                  fontWeight: 800,
                                  fontSize: '13px',
                                  color: '#0f172a',
                                  lineHeight: 1.2,
                                }}
                              >
                                {group.nameEn}
                              </div>
                              {group.nameBn && (
                                <div style={{ fontSize: '11px', color: '#475569', fontWeight: 600 }}>
                                  {group.nameBn}
                                </div>
                              )}
                              {group.email && (
                                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>
                                  {group.email}
                                </div>
                              )}
                              <div style={{ marginTop: '4px' }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    background: '#0284c7',
                                    color: '#ffffff',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    fontSize: '10px',
                                    fontWeight: 800,
                                  }}
                                >
                                  📚 মোট {group.totalSubjects} টি বিষয়
                                </span>
                              </div>
                            </div>
                          </td>
                        )}

                        {/* Column 2: Class - Section */}
                        <td
                          style={{
                            padding: '6px 12px',
                            verticalAlign: 'middle',
                            borderRight: '1.5px solid #cbd5e1',
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: '12px', color: '#0f172a', whiteSpace: 'nowrap' }}>
                            Class {assign.class} - {assign.section}
                          </div>
                        </td>

                        {/* Column 3: Subject */}
                        <td
                          style={{
                            padding: '6px 12px',
                            verticalAlign: 'middle',
                            borderRight: '1.5px solid #cbd5e1',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                background: '#3b82f6',
                                color: '#ffffff',
                                fontSize: '10px',
                                fontWeight: 800,
                                flexShrink: 0,
                              }}
                            >
                              {assignIdx + 1}
                            </span>
                            <div>
                              <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '12px' }}>
                                {assign.subject_name}
                              </span>
                              {assign.subject_code && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: '#64748b',
                                    marginLeft: '4px',
                                    fontWeight: 600,
                                  }}
                                >
                                  ({assign.subject_code})
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Column 4: Mark Entry Progress */}
                        <td
                          style={{
                            padding: '6px 12px',
                            verticalAlign: 'middle',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                              <span style={{ fontWeight: 800, fontSize: '12px', color: '#0f172a' }}>
                                {prog.enteredCount} / {prog.totalStudents} জন
                              </span>
                              <span
                                style={{
                                  background: badgeBg,
                                  color: badgeColor,
                                  padding: '1px 7px',
                                  borderRadius: '8px',
                                  fontSize: '10px',
                                  fontWeight: 900,
                                  border: `1px solid ${badgeColor}33`,
                                }}
                              >
                                {prog.percentage}%
                              </span>
                            </div>

                            {/* Mini Progress Bar */}
                            <div
                              style={{
                                height: '5px',
                                width: '100%',
                                background: '#e2e8f0',
                                borderRadius: '3px',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  width: `${Math.min(100, Math.max(0, prog.percentage))}%`,
                                  background: barColor,
                                  borderRadius: '3px',
                                  transition: 'width 0.3s ease',
                                }}
                              />
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
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes spinReverse {
          0% { transform: rotate(360deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes loadingProgress {
          0% { left: -40%; }
          50% { left: 100%; }
          100% { left: -40%; }
        }
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
            padding: 4px 6px !important;
            border-color: #000 !important;
            font-size: 10px !important;
          }
          th {
            background-color: #f1f5f9 !important;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  )
}
