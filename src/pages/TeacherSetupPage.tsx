import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'

interface ExamSubject { 
  id: number; 
  subject_code: string; 
  subject_name: string; 
  full_marks?: number;
  total_cq?: number;
  total_mcq?: number;
  total_practical?: number;
  pass_cq?: number;
  pass_mcq?: number;
  pass_practical?: number;
  pass_total?: number;
  exam_class?: any[];
}
interface Assignment {
  id?: number;
  subject_code: string;
  subject_name: string;
  class: number;
  section: string;
  teacher_email_id: string;
  teacher_name_en: string;
  teacher_name_bn: string;
  comment: string;
  exam_id: number;
}

interface ClassSubjectRule {
  class: number
  subject_code: string
  subject_name: string
  sections: string[]
}

interface TableRowItem {
  class: number
  section: string
  subject_code: string
  subject_name: string
  subjectIndex: number
  isFirstInGroup: boolean
  groupRowSpan: number
  isLastInGroup: boolean
}

export default function TeacherSetupPage() {
  const { id: examId } = useParams()
  const navigate = useNavigate()
  
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [examSubjects, setExamSubjects] = useState<ExamSubject[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [classRulesForMatrix, setClassRulesForMatrix] = useState<ClassSubjectRule[]>([])
  const [sectionsByClass, setSectionsByClass] = useState<Record<number, string[]>>({})
  
  const [enrolledClasses, setEnrolledClasses] = useState<number[]>([])
  const [examName, setExamName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [status, setStatus] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'matrix'>('table')

  const [form, setForm] = useState({
    teacher_iid: '',
    teacher_name_en: '',
    teacher_name_bn: '',
    teacher_email_id: '',
    class: '',
    section: '',
    subject_code: '',
    subject_name: '',
    comment: '',
  })

  useEffect(() => { loadAll() }, [examId])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  async function loadAll() {
    setLoading(true)
    if (!examId) { setLoading(false); return }

    // 1. Exam name
    const { data: ex } = await supabase.from('FMHS_exams_names').select('exam_name').eq('id', examId).single()
    if (ex) setExamName(ex.exam_name)

    // 2. Teachers
    const { data: tData } = await supabase
      .from('teacher_database')
      .select('iid, teacher_name_en, teacher_name_bn, teacher_email_id')
      .not('teacher_email_id', 'is', null)
      .neq('teacher_email_id', '')
      .order('teacher_name_en')
    setTeachers((tData ?? []) as Teacher[])

    // 3. Class-Subject Rules (Now from FMHS_exam_subjects)
    const { data: rulesData } = await supabase
      .from('FMHS_exam_subjects')
      .select('*')
      .eq('exam_id', examId)
    
    const parsedRules: ClassSubjectRule[] = []
    rulesData?.forEach(r => {
      const clsList = (r.exam_class || []) as any[]
      clsList?.forEach(c => {
        if (c.selected) {
          parsedRules.push({
            class: Number(c.class),
            subject_code: String(r.subject_code),
            subject_name: r.subject_name,
            sections: c.sections || []
          })
        }
      })
    })
    setClassRulesForMatrix(parsedRules)

    // 4. Sections for each class (from enrolled students)
    const { data: enrolledData } = await supabase
      .from('FMHS_exam_data')
      .select('class, section')
      .eq('exam_id', examId)
    
    const secMap: Record<number, string[]> = {}
    enrolledData?.forEach(r => {
      const cls = Number(r.class)
      if (!secMap[cls]) secMap[cls] = []
      if (r.section && !secMap[cls].includes(r.section)) secMap[cls].push(r.section)
    })
    Object.keys(secMap).forEach(k => secMap[Number(k)].sort())
    setSectionsByClass(secMap)
    setEnrolledClasses(Object.keys(secMap).map(Number).sort((a, b) => a - b))

    // 5. Teacher assignments (Now from FMHS_exam_teacher_selection)
    const { data: aData } = await supabase
      .from('FMHS_exam_teacher_selection')
      .select('*')
      .eq('exam_id', Number(examId))
    setAssignments((aData ?? []) as Assignment[])
    
    // 6. All configured subjects (for row list)
    setExamSubjects((rulesData ?? []) as ExamSubject[])

    setIsDirty(false)
    setLoading(false)
  }

  function openAssignModal(cls: number, sec: string, subCode: string, subName: string) {
    setForm({
      ...form,
      class: String(cls),
      section: sec,
      subject_code: subCode,
      subject_name: subName,
      comment: ''
    })
    setShowModal(true)
    setStatus('')
  }

  function onTeacherChange(iid: string) {
    const t = teachers.find(t => String(t.iid) === iid)
    setForm(f => ({
      ...f,
      teacher_iid: iid,
      teacher_name_en: t?.teacher_name_en ?? '',
      teacher_name_bn: t?.teacher_name_bn ?? '',
      teacher_email_id: t?.teacher_email_id ?? '',
    }))
  }

  function handleTeacherSelect(cls: number, sec: string, subCode: string, subName: string, teacherEmail: string) {
    if (!teacherEmail) {
      setAssignments(prev => prev.filter(
        a => !(a.class === cls && a.section === sec && String(a.subject_code) === String(subCode))
      ))
      setIsDirty(true)
      return
    }

    const t = teachers.find(t => t.teacher_email_id === teacherEmail)
    if (!t) return

    const newAssignment: Assignment = {
      id: Date.now(),
      exam_id: Number(examId),
      teacher_email_id: t.teacher_email_id,
      teacher_name_en: t.teacher_name_en,
      teacher_name_bn: t.teacher_name_bn || '',
      class: Number(cls),
      section: sec,
      subject_name: subName,
      subject_code: String(subCode),
      comment: '',
    }

    setAssignments(prev => {
      const filtered = prev.filter(
        a => !(a.class === cls && a.section === sec && String(a.subject_code) === String(subCode))
      )
      return [...filtered, newAssignment]
    })
    setIsDirty(true)
  }

  function saveAssignmentLocally(e: React.FormEvent) {
    e.preventDefault()
    if (!form.teacher_email_id || !form.subject_code || !form.class || !form.section) {
      setStatus('⚠️ All fields are required.')
      return
    }

    const newAssignment: Assignment = {
      id: Date.now(),
      exam_id: Number(examId),
      teacher_email_id: form.teacher_email_id,
      teacher_name_en: form.teacher_name_en,
      teacher_name_bn: form.teacher_name_bn,
      class: Number(form.class),
      section: form.section,
      subject_name: form.subject_name,
      subject_code: String(form.subject_code),
      comment: form.comment || '',
    }

    setAssignments(prev => {
      const filtered = prev.filter(
        a => !(a.class === newAssignment.class && a.section === newAssignment.section && String(a.subject_code) === newAssignment.subject_code)
      )
      return [...filtered, newAssignment]
    })

    setIsDirty(true)
    setShowModal(false)
  }

  function delAssignmentLocally(cls: number, sec: string, subCode: string) {
    setAssignments(prev => prev.filter(
      a => !(a.class === cls && a.section === sec && String(a.subject_code) === String(subCode))
    ))
    setIsDirty(true)
  }

  async function handleSaveChanges() {
    if (!examId) return
    setSaving(true)
    setStatus('')

    try {
      // 1. Delete current assignments for this exam
      const { error: delError } = await supabase
        .from('FMHS_exam_teacher_selection')
        .delete()
        .eq('exam_id', Number(examId))

      if (delError) throw delError

      // 2. Insert new assignments
      if (assignments.length > 0) {
        const payload = assignments.map(a => ({
          exam_id: Number(examId),
          teacher_email_id: a.teacher_email_id,
          teacher_name_en: a.teacher_name_en,
          teacher_name_bn: a.teacher_name_bn,
          class: Number(a.class),
          section: a.section,
          subject_name: a.subject_name,
          subject_code: String(a.subject_code),
          comment: a.comment || '',
        }))

        const { error: insError } = await supabase
          .from('FMHS_exam_teacher_selection')
          .insert(payload)

        if (insError) throw insError
      }

      setIsDirty(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      alert('❌ Save Error: ' + (err.message || 'Could not save changes'))
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    if (isDirty && !confirm('You have unsaved changes. Leave without saving?')) return
    navigate(`/exam-panel/${examId}`)
  }

  const uniqueClasses = classRulesForMatrix.length > 0 
    ? [...new Set(classRulesForMatrix.map(r => r.class))].sort((a, b) => a - b)
    : enrolledClasses

  const uniqueSubjects = classRulesForMatrix.length > 0
    ? examSubjects.filter(s => classRulesForMatrix.some(r => String(r.subject_code) === String(s.subject_code)))
    : examSubjects

  // Compute table rows for Table view (Grouped by Class - Section)
  const tableRows: TableRowItem[] = []
  uniqueClasses.forEach(cls => {
    const secList = sectionsByClass[cls] || []
    const classRules = classRulesForMatrix.filter(r => r.class === cls)

    secList.forEach(sec => {
      const secSubRows: { subject_code: string; subject_name: string }[] = []

      uniqueSubjects.forEach(sub => {
        const ruleConfig = classRules.find(r => String(r.subject_code) === String(sub.subject_code))
        const isMapped = !!ruleConfig
        
        let isSecAllowed = false
        if (isMapped) {
          if (!ruleConfig.sections || ruleConfig.sections.length === 0) {
            isSecAllowed = true
          } else {
            isSecAllowed = ruleConfig.sections.includes(sec)
          }
        }

        const hasAssign = assignments.some(a => a.class === cls && a.section === sec && String(a.subject_code) === String(sub.subject_code))

        if (isSecAllowed || hasAssign) {
          secSubRows.push({
            subject_code: String(sub.subject_code),
            subject_name: sub.subject_name
          })
        }
      })

      const groupTotal = secSubRows.length
      secSubRows.forEach((r, idx) => {
        const isFirstInGroup = idx === 0
        const isLastInGroup = idx === groupTotal - 1

        tableRows.push({
          class: cls,
          section: sec,
          subject_code: r.subject_code,
          subject_name: r.subject_name,
          subjectIndex: idx + 1,
          isFirstInGroup,
          groupRowSpan: groupTotal,
          isLastInGroup
        })
      })
    })
  })

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}><div className="spinner" /></div>

  const isMatrixEmpty = uniqueClasses.length === 0 || uniqueSubjects.length === 0

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'Aneek Bangla', 'Outfit', sans-serif", color: '#1e293b' }}>
      <header style={{ background: '#fff', padding: '16px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={handleBack} style={{ background: '#f1f5f9', border: 'none', color: '#64748b', borderRadius: '12px', padding: '8px 16px', cursor: 'pointer', fontWeight: 700 }}>← Back</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900 }}>👩‍🏫 Teacher Access Control</h1>
          <p style={{ margin: 0, fontSize: '11px', color: '#ec4899', fontWeight: 800 }}>{examName.toUpperCase()}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {saveSuccess && (
            <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ✓ Save Successful!
            </span>
          )}

          <button 
            onClick={() => setViewMode(v => v === 'table' ? 'matrix' : 'table')}
            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '10px 16px', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}
          >
            {viewMode === 'table' ? '▦ Grid Matrix View' : '📋 List Table View'}
          </button>
          
          <button 
            onClick={handleSaveChanges} 
            disabled={saving || !isDirty}
            style={{ 
              background: isDirty ? '#16a34a' : '#94a3b8', 
              color: '#fff', 
              border: 'none', 
              padding: '10px 20px', 
              borderRadius: '12px', 
              fontWeight: 800, 
              cursor: isDirty ? 'pointer' : 'not-allowed', 
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: isDirty ? '0 4px 12px rgba(22, 163, 74, 0.25)' : 'none',
              transition: 'all 0.2s ease',
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? '⏳ Saving...' : (isDirty ? '💾 Save Changes *' : '💾 Saved')}
          </button>

          <button onClick={() => {
            if (isDirty && !confirm('You have unsaved changes. Leave without saving?')) return
            navigate(`/exam-subjects/${examId}`)
          }} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>
            ⚙️ Subject Rules
          </button>
        </div>
      </header>

      <main style={{ padding: '30px 40px' }}>
        <div style={{ background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.02)', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          {isMatrixEmpty ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', textAlign: 'center' }}>
              <div style={{ fontSize: '64px', marginBottom: '24px' }}>📚</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '12px' }}>No Subject Rules Configured</h2>
              <p style={{ color: '#64748b', maxWidth: '400px', margin: '0 auto 30px', lineHeight: '1.6' }}>
                You need to assign subjects to classes in the **Subject Rules** page before you can assign teachers.
              </p>
              <button 
                onClick={() => navigate(`/exam-subjects/${examId}`)}
                style={{ background: '#ec4899', color: '#fff', border: 'none', padding: '14px 32px', borderRadius: '16px', fontWeight: 900, fontSize: '14px', cursor: 'pointer', boxShadow: '0 10px 20px rgba(236,72,153,0.2)' }}
              >
                Go to Subject Rules
              </button>
            </div>
          ) : viewMode === 'table' ? (
            /* ── NEW SEPARATE MARKS COLUMNS TABLE VIEW LAYOUT ── */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #cbd5e1' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ ...thTableStyle, width: '170px' }}>Class - Section</th>
                    <th style={{ ...thTableStyle, textAlign: 'left' }}>Subject name</th>
                    <th style={{ ...thTableStyle, width: '90px', textAlign: 'center' }}>CQ</th>
                    <th style={{ ...thTableStyle, width: '90px', textAlign: 'center' }}>MCQ</th>
                    <th style={{ ...thTableStyle, width: '90px', textAlign: 'center' }}>Practical</th>
                    <th style={{ ...thTableStyle, width: '95px', textAlign: 'center' }}>Pass Marks</th>
                    <th style={{ ...thTableStyle, textAlign: 'left', width: '260px' }}>Teacher access</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, idx) => {
                    const currentAssign = assignments.find(
                      a => a.class === row.class && a.section === row.section && String(a.subject_code) === String(row.subject_code)
                    )
                    const ruleObj = examSubjects.find(s => String(s.subject_code) === String(row.subject_code))

                    const hasCq = ruleObj?.total_cq !== undefined && ruleObj.total_cq > 0
                    const hasMcq = ruleObj?.total_mcq !== undefined && ruleObj.total_mcq > 0
                    const hasPrac = ruleObj?.total_practical !== undefined && ruleObj.total_practical > 0

                    return (
                      <tr 
                        key={`${row.class}-${row.section}-${row.subject_code}`} 
                        style={{ 
                          borderBottom: row.isLastInGroup ? '2px solid #94a3b8' : '1px solid #e2e8f0',
                          background: idx % 2 === 0 ? '#fff' : '#fafbfc'
                        }}
                      >
                        {row.isFirstInGroup && (
                          <td 
                            rowSpan={row.groupRowSpan} 
                            style={{ 
                              padding: '12px 14px', 
                              borderRight: '1.5px solid #cbd5e1', 
                              textAlign: 'center', 
                              verticalAlign: 'middle', 
                              background: '#f8fafc'
                            }}
                          >
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontWeight: 900, fontSize: '15px', color: '#0f172a', lineHeight: 1 }}>Class {row.class}</span>
                              <span style={{ background: '#e0e7ff', color: '#3730a3', fontSize: '11px', fontWeight: 800, padding: '2px 10px', borderRadius: '12px', letterSpacing: '0.03em' }}>{row.section}</span>
                            </div>
                          </td>
                        )}

                        {/* Subject Name */}
                        <td style={{ padding: '8px 14px', borderRight: '1.5px solid #cbd5e1', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ background: '#f1f5f9', color: '#64748b', fontWeight: 800, fontSize: '11px', minWidth: '22px', height: '22px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              {row.subjectIndex}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>{row.subject_name}</span>
                            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>({row.subject_code})</span>
                          </div>
                        </td>

                        {/* CQ Column */}
                        <td style={{ padding: '8px 10px', borderRight: '1.5px solid #cbd5e1', verticalAlign: 'middle', textAlign: 'center' }}>
                          {hasCq ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1 }}>
                              <span style={{ fontWeight: 800, fontSize: '13px', color: '#0369a1' }}>{ruleObj.total_cq}</span>
                              <span style={{ fontSize: '10px', color: ruleObj.pass_cq ? '#0284c7' : '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                                Pass: {ruleObj.pass_cq && ruleObj.pass_cq > 0 ? ruleObj.pass_cq : '-'}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>
                          )}
                        </td>

                        {/* MCQ Column */}
                        <td style={{ padding: '8px 10px', borderRight: '1.5px solid #cbd5e1', verticalAlign: 'middle', textAlign: 'center' }}>
                          {hasMcq ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1 }}>
                              <span style={{ fontWeight: 800, fontSize: '13px', color: '#b45309' }}>{ruleObj.total_mcq}</span>
                              <span style={{ fontSize: '10px', color: ruleObj.pass_mcq ? '#d97706' : '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                                Pass: {ruleObj.pass_mcq && ruleObj.pass_mcq > 0 ? ruleObj.pass_mcq : '-'}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>
                          )}
                        </td>

                        {/* Practical Column */}
                        <td style={{ padding: '8px 10px', borderRight: '1.5px solid #cbd5e1', verticalAlign: 'middle', textAlign: 'center' }}>
                          {hasPrac ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1 }}>
                              <span style={{ fontWeight: 800, fontSize: '13px', color: '#6b21a8' }}>{ruleObj.total_practical}</span>
                              <span style={{ fontSize: '10px', color: ruleObj.pass_practical ? '#9333ea' : '#94a3b8', fontWeight: 600, marginTop: '2px' }}>
                                Pass: {ruleObj.pass_practical && ruleObj.pass_practical > 0 ? ruleObj.pass_practical : '-'}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>
                          )}
                        </td>

                        {/* Pass Marks Column */}
                        <td style={{ padding: '8px 10px', borderRight: '1.5px solid #cbd5e1', verticalAlign: 'middle', textAlign: 'center' }}>
                          {ruleObj?.pass_total !== undefined ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1 }}>
                              <span style={{ fontWeight: 900, fontSize: '13px', color: '#b91c1c' }}>{ruleObj.pass_total}</span>
                              <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>/ {ruleObj.full_marks || 100}</span>
                            </div>
                          ) : (
                            <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>
                          )}
                        </td>

                        {/* Teacher Access Column */}
                        <td style={{ padding: '6px 12px', verticalAlign: 'middle' }}>
                          <select
                            value={currentAssign?.teacher_email_id || ''}
                            onChange={(e) => handleTeacherSelect(row.class, row.section, row.subject_code, row.subject_name, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: currentAssign ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                              background: currentAssign ? '#f0fdf4' : '#fff',
                              fontWeight: currentAssign ? 700 : 500,
                              color: currentAssign ? '#15803d' : '#64748b',
                              fontSize: '12px',
                              outline: 'none',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                          >
                            <option value="">-- Choose Teacher --</option>
                            {teachers.map(t => (
                              <option key={t.iid || t.teacher_email_id} value={t.teacher_email_id}>
                                {t.teacher_name_en} {t.teacher_name_bn ? `(${t.teacher_name_bn})` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* ── GRID MATRIX VIEW ── */
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', border: '1px solid #cbd5e1' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: '280px', position: 'sticky', left: 0, zIndex: 5, background: '#f8fafc', borderRight: '2px solid #cbd5e1' }}>Subject</th>
                  {uniqueClasses.map(cls => (
                    <th key={cls} style={thStyle}>Class {cls}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {uniqueSubjects.map((sub, idx) => (
                  <tr key={sub.subject_code} style={{ background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                    <td style={{ ...tdStyle, fontWeight: 800, color: '#0f172a', position: 'sticky', left: 0, zIndex: 4, background: idx % 2 === 0 ? '#fff' : '#fafbfc', borderRight: '2px solid #cbd5e1' }}>
                      <div style={{ fontSize: '14px', marginBottom: '2px' }}>{sub.subject_name}</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em' }}>CODE: {sub.subject_code}</div>
                    </td>
                    {uniqueClasses.map(cls => {
                      const ruleConfig = classRulesForMatrix.find(r => r.class === cls && String(r.subject_code) === String(sub.subject_code))
                      const isMapped = !!ruleConfig
                      
                      let sections: string[] = []
                      if (isMapped) {
                        sections = sectionsByClass[cls] || []
                        if (ruleConfig?.sections && ruleConfig.sections.length > 0) {
                          sections = sections.filter(s => ruleConfig.sections.includes(s))
                        }
                      } else {
                        const existingAssignSecs = assignments
                          .filter(a => a.class === cls && String(a.subject_code) === String(sub.subject_code))
                          .map(a => a.section)
                        sections = [...new Set(existingAssignSecs)]
                      }
                      
                      return (
                        <td key={cls} style={{ ...tdStyle, background: isMapped ? 'transparent' : '#f8fafc' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {sections.length === 0 && (
                              <div style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>
                                {isMapped ? 'No sections enrolled' : '—'}
                              </div>
                            )}
                            {sections.map(sec => {
                              const assign = assignments.find(a => a.class === cls && a.section === sec && String(a.subject_code) === String(sub.subject_code))
                              return (
                                <div key={sec} style={{ 
                                  padding: '10px 14px', 
                                  background: assign ? '#f0fdf4' : (isMapped ? '#fff' : '#f8fafc'), 
                                  border: `1px solid ${assign ? '#bbf7d0' : '#e2e8f0'}`, 
                                  borderRadius: '16px', 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center',
                                  fontSize: '12px',
                                  transition: '0.2s',
                                  boxShadow: assign ? '0 2px 4px rgba(22, 101, 52, 0.05)' : 'none'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontWeight: 900, color: '#64748b', fontSize: '11px', background: '#f1f5f9', padding: '2px 8px', borderRadius: '8px' }}>{sec}</span>
                                    {assign ? (
                                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ fontWeight: 700, color: '#166534', fontSize: '13px', lineHeight: 1.2 }}>
                                          {assign.teacher_name_en}
                                        </div>
                                        {assign.teacher_name_bn && (
                                          <div style={{ fontWeight: 600, color: '#4ade80', fontSize: '11px', lineHeight: 1.2, marginTop: '1px' }}>
                                            {assign.teacher_name_bn}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 500 }}>Unassigned</span>
                                    )}
                                  </div>
                                  
                                  {assign ? (
                                    <button 
                                      onClick={() => delAssignmentLocally(cls, sec, sub.subject_code)} 
                                      style={{ border: 'none', background: '#fff1f2', color: '#ef4444', width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}
                                      onMouseOver={e => e.currentTarget.style.background = '#fee2e2'}
                                      onMouseOut={e => e.currentTarget.style.background = '#fff1f2'}
                                    >
                                      🗑️
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => openAssignModal(cls, sec, sub.subject_code, sub.subject_name)}
                                      style={{ border: 'none', background: '#ec4899', color: '#fff', width: '28px', height: '28px', borderRadius: '10px', cursor: 'pointer', fontWeight: 900, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(236,72,153,0.2)', transition: '0.2s' }}
                                      onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                                      onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                      +
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </main>

      {/* Assignment Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', width: '400px', padding: '32px', borderRadius: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'modalIn 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 900, margin: 0 }}>Assign Teacher</h2>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: '#f1f5f9', width: '32px', height: '32px', borderRadius: '10px', cursor: 'pointer' }}>✕</button>
            </div>
            
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '16px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }}>Assignment For</div>
              <div style={{ fontWeight: 900, fontSize: '14px', color: '#0f172a' }}>{form.subject_name}</div>
              <div style={{ fontSize: '12px', color: '#ec4899', fontWeight: 700 }}>Class {form.class} • Section {form.section}</div>
            </div>

            <form onSubmit={saveAssignmentLocally} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Select Teacher</label>
                <select style={inputStyle} value={form.teacher_iid} onChange={e => onTeacherChange(e.target.value)} required>
                  <option value="">-- Choose Teacher --</option>
                  {teachers.map(t => (
                    <option key={t.iid} value={t.iid}>
                      {t.teacher_name_en} {t.teacher_name_bn ? `(${t.teacher_name_bn})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Comment (Optional)</label>
                <input style={inputStyle} value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} placeholder="e.g. 1st paper only" />
              </div>

              {status && <div style={{ fontSize: '13px', color: '#ef4444', fontWeight: 600 }}>{status}</div>}

              <button type="submit" style={{ padding: '14px', borderRadius: '16px', background: '#ec4899', color: '#fff', border: 'none', fontWeight: 900, cursor: 'pointer', marginTop: '10px', boxShadow: '0 10px 20px rgba(236,72,153,0.2)' }}>
                Confirm Assignment
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes modalIn { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .spinner { width: 30px; height: 30px; border: 3px solid #f1f5f9; border-top-color: #ec4899; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

const thStyle: React.CSSProperties = { padding: '20px', background: '#f8fafc', borderBottom: '2px solid #cbd5e1', borderRight: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 800, color: '#64748b', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }
const thTableStyle: React.CSSProperties = { padding: '10px 14px', background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', borderRight: '1.5px solid #cbd5e1', fontSize: '12px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }
const tdStyle: React.CSSProperties = { padding: '16px 20px', borderBottom: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', verticalAlign: 'top' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', borderRadius: '12px', border: '1.5px solid #e2e8f0', fontSize: '13px', fontWeight: 600, background: '#f8fafc', outline: 'none', boxSizing: 'border-box' }
