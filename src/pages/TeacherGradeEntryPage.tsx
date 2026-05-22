import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'

interface Assignment {
  id: number
  exam_id: number
  class: number
  section: string
  subject_code: string
  final_submitted?: boolean
  exams: { exam_name: string; year: number; is_live: boolean; teacher_entry_enabled: boolean }
}

interface SubjectRule {
  subject_name: string
  pass_cq: number
  pass_mcq: number
  pass_practical: number
  pass_total: number
  total_cq: number
  total_mcq: number
  total_practical: number
  full_marks: number
}

interface StudentRow { [key: string]: any }

export default function TeacherGradeEntryPage() {
  const { examId, assignId } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [rule, setRule] = useState<SubjectRule | null>(null)
  const [data, setData] = useState<StudentRow[]>([])
  const [showDetails, setShowDetails] = useState(false)
  const [savingRows, setSavingRows] = useState<Record<string, 'pending' | 'saving' | 'success'>>({})
  const [myAssignments, setMyAssignments] = useState<Assignment[]>([])
  
  const editRef = useRef<Record<string, Record<string, any>>>({})
  
  // Responsive mobile state
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  function calculateSubjectTotal(row: StudentRow, edits: Record<string, any>) {
    if (!rule) return 0
    const base = `*${rule.subject_name}`
    const getVal = (key: string) => Object.prototype.hasOwnProperty.call(edits, key) ? edits[key] : row[key]
    const cq = Number(getVal(`${base}_CQ`)) || 0
    const mcq = Number(getVal(`${base}_MCQ`)) || 0
    const practical = Number(getVal(`${base}_Practical`)) || 0
    return cq + mcq + practical
  }

  useEffect(() => { loadContext() }, [assignId])

  async function loadContext() {
    if (!assignId) return
    setLoading(true)
    editRef.current = {}
    setSavingRows({})
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/login'); return }

    // Load ALL assignments for switcher
    const { data: teacherSelections, error: selectionError } = await supabase
      .from('FMHS_exam_teacher_selection')
      .select('*')
      .eq('teacher_email_id', user.email)
      .not('exam_id', 'is', null)
    
    if (selectionError || !teacherSelections || teacherSelections.length === 0) {
      setMyAssignments([])
      setStatus('No assignments found')
      setLoading(false)
      return
    }

    // Fetch details of all unique exams referenced by assignments
    const examIds = [...new Set(teacherSelections.map(s => Number(s.exam_id)))]
    const { data: exams, error: examsError } = await supabase
      .from('FMHS_exams_names')
      .select('id, exam_name, year, is_live, teacher_entry_enabled')
      .in('id', examIds)

    if (examsError) {
      console.error('Error loading exams:', examsError)
      setLoading(false)
      return
    }

    // Map exam details onto each assignment in-memory and filter for live exams only
    const mappedAssigns = teacherSelections.map(s => {
      const exam = (exams || []).find(e => Number(e.id) === Number(s.exam_id))
      return {
        ...s,
        exams: exam || { exam_name: 'Unknown Exam', year: 0, is_live: false, teacher_entry_enabled: false }
      }
    }).filter(a => a.exams.is_live)

    setMyAssignments(mappedAssigns as any[])

    // Find the single current active assignment from mapped list
    const assign = mappedAssigns.find(
      a => String(a.subject_code) === String(assignId) && Number(a.exam_id) === Number(examId)
    )

    if (!assign) { setStatus('Assignment not found'); setLoading(false); return }
    setAssignment(assign as any)

    const { data: rList } = await supabase
      .from('FMHS_exam_subjects').select('*')
      .eq('exam_id', examId).eq('subject_code', String(assign.subject_code))
    
    // Find the rule that is specifically assigned to this class
    const correctRule = rList?.find(r => 
      (r.exam_class as any[])?.some(c => Number(c.class) === Number(assign.class) && c.selected)
    )
    if (correctRule) setRule(correctRule)

    const { data: rows } = await supabase
      .from('FMHS_exam_data').select('*')
      .eq('exam_id', examId).eq('class', assign.class).eq('section', assign.section)
      .order('roll', { ascending: true })

    const studentRows = rows || []
    
    // RESTORE FROM LOCAL STORAGE
    const localKey = `unsaved_marks_${assignId}`
    const localData = localStorage.getItem(localKey)
    if (localData) {
      try {
        const parsed = JSON.parse(localData)
        editRef.current = parsed
        const base = rule ? `*${rule.subject_name}` : ''
        studentRows.forEach((row: any) => {
          if (parsed[row.id]) Object.assign(row, parsed[row.id])
          if (base && parsed[row.id]) {
            const total = calculateSubjectTotal(row as StudentRow, parsed[row.id])
            parsed[row.id][`${base}_Total`] = total
            row[`${base}_Total`] = total
          }
        })
        localStorage.setItem(localKey, JSON.stringify(parsed))
        setSavingRows(Object.keys(parsed).reduce((acc, rid) => ({ ...acc, [rid]: 'pending' }), {}))
      } catch (e) { console.error('Local restore error', e) }
    }

    setData(studentRows)
    setLoading(false)
  }

  function recalcTotal(ri: number) {
    if (!rule) return
    const base = `*${rule.subject_name}`
    const row = data[ri]
    const pending = editRef.current[Number(row.id)] || {}
    const total = calculateSubjectTotal(row, pending)
    
    editRef.current[Number(row.id)] = { ...editRef.current[Number(row.id)], [`${base}_Total`]: total }
    const newData = [...data]
    newData[ri][`${base}_Total`] = total
    setData(newData)
  }

  function handleEdit(rowId: number, col: string, value: string, ri: number) {
    if (!editRef.current[rowId]) editRef.current[rowId] = {}
    editRef.current[rowId][col] = value === '' ? null : Number(value)
    setSavingRows(prev => ({ ...prev, [rowId]: 'pending' }))
    recalcTotal(ri)

    const localKey = `unsaved_marks_${assignId}`
    localStorage.setItem(localKey, JSON.stringify(editRef.current))
  }

  async function saveRow(rowId: number) {
    if (!assignment?.exams.is_live || !assignment?.exams.teacher_entry_enabled) {
      alert('❌ এই পরীক্ষাটি বন্ধ বা শিক্ষকগণের এন্ট্রির অনুমতি নেই।')
      return
    }
    if (!editRef.current[rowId]) return
    setSavingRows(prev => ({ ...prev, [rowId]: 'saving' }))
    
    const { error } = await supabase.from('FMHS_exam_data').update(editRef.current[rowId]).eq('id', rowId)
    if (!error) {
      setSavingRows(prev => ({ ...prev, [rowId]: 'success' }))
      delete editRef.current[rowId]
      const localKey = `unsaved_marks_${assignId}`
      if (Object.keys(editRef.current).length === 0) localStorage.removeItem(localKey)
      else localStorage.setItem(localKey, JSON.stringify(editRef.current))

      setTimeout(() => {
        setSavingRows(prev => {
          const ns = { ...prev }
          if (ns[rowId] === 'success') delete ns[rowId]
          return ns
        })
      }, 3000)
    } else {
      setSavingRows(prev => ({ ...prev, [rowId]: 'pending' }))
      alert('❌ ত্রুটি: ' + error.message)
    }
  }

  async function saveAll() {
    if (!assignment?.exams.is_live || !assignment?.exams.teacher_entry_enabled) {
      alert('❌ এই পরীক্ষাটি বন্ধ বা শিক্ষকগণের এন্ট্রির অনুমতি নেই।')
      return
    }
    setSaving(true)
    setStatus('সংরক্ষণ হচ্ছে...')
    let done = 0
    for (const [rowId, edits] of Object.entries(editRef.current)) {
      setSavingRows(prev => ({ ...prev, [rowId]: 'saving' }))
      const { error } = await supabase.from('FMHS_exam_data').update(edits).eq('id', rowId)
      if (!error) {
        done++
        setSavingRows(prev => ({ ...prev, [rowId]: 'success' }))
        delete editRef.current[rowId]
      } else {
        setSavingRows(prev => ({ ...prev, [rowId]: 'pending' }))
      }
    }

    const localKey = `unsaved_marks_${assignId}`
    if (Object.keys(editRef.current).length === 0) localStorage.removeItem(localKey)
    else localStorage.setItem(localKey, JSON.stringify(editRef.current))

    setStatus(`✅ ${done} জন শিক্ষার্থীর মার্ক সফলভাবে সংরক্ষণ হয়েছে।`)
    setTimeout(() => { setStatus(''); setSavingRows({}) }, 5000)
    setSaving(false)
  }

  async function handleFinalSubmit() {
    if (!assignment) return
    const msg = `আপনি কি নিশ্চিত যে আপনি এই বিষয়ের মার্কস ফাইনাল সাবমিট করতে চান?
ফাইনাল সাবমিটের পর আপনি আর কোনো পরিবর্তন বা নতুন এন্ট্রি করতে পারবেন না।`
    if (!confirm(msg)) return

    // Save all unsaved marks first
    if (Object.keys(editRef.current).length > 0) {
      setSaving(true)
      setStatus('প্রথমে অসংরক্ষিত পরিবর্তনগুলো সংরক্ষণ করা হচ্ছে...')
      let done = 0
      for (const [rowId, edits] of Object.entries(editRef.current)) {
        const { error } = await supabase.from('FMHS_exam_data').update(edits).eq('id', rowId)
        if (!error) {
          done++
          delete editRef.current[rowId]
        }
      }
      const localKey = `unsaved_marks_${assignId}`
      if (Object.keys(editRef.current).length === 0) localStorage.removeItem(localKey)
      else localStorage.setItem(localKey, JSON.stringify(editRef.current))
    }

    setStatus('ফাইনাল সাবমিট করা হচ্ছে...')
    const { error } = await supabase
      .from('FMHS_exam_teacher_selection')
      .update({ final_submitted: true })
      .eq('id', assignment.id)

    if (!error) {
      setAssignment(prev => prev ? { ...prev, final_submitted: true } : null)
      setStatus('✅ বিষয়ের মার্কস সফলভাবে ফাইনাল সাবমিট করা হয়েছে।')
      setTimeout(() => setStatus(''), 5000)
    } else {
      setStatus('❌ ত্রুটি: ' + error.message)
      alert('❌ ত্রুটি: ' + error.message)
    }
    setSaving(false)
  }

  async function resetLocalMarks() {
    if (!confirm('আপনি কি নিশ্চিত? এটি আপনার করা সব অসংরক্ষিত পরিবর্তন মুছে ফেলবে এবং ডাটাবেস থেকে ফ্রেশ ডাটা লোড করবে।')) return
    localStorage.removeItem(`unsaved_marks_${assignId}`)
    editRef.current = {}
    setSavingRows({})
    await loadContext()
    setStatus('🔄 লোকাল মার্ক মুছে ফেলা হয়েছে এবং নতুন করে ডাটা লোড হয়েছে।')
    setTimeout(() => setStatus(''), 3000)
  }

  if (loading) return <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>

  if (!assignment || !rule) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e293b' }}>
       <div style={{ textAlign: 'center', background: '#fff', padding: '48px', borderRadius: '32px', border: '1px solid #e2e8f0' }}>
          <h3>তথ্য পাওয়া যায়নি</h3>
          <button onClick={() => navigate('/teacher-dashboard')} style={{ marginTop: '20px', padding: '12px 24px', borderRadius: '12px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer' }}>ফিরুন</button>
       </div>
    </div>
  )

  const isEditable = assignment.exams.is_live && assignment.exams.teacher_entry_enabled && !assignment.final_submitted
  const base = `*${rule.subject_name}`
  const comps = [
    { label: 'CQ', key: `${base}_CQ`, pass: rule.pass_cq, editable: rule.total_cq > 0 },
    { label: 'MCQ', key: `${base}_MCQ`, pass: rule.pass_mcq, editable: rule.total_mcq > 0 },
    { label: 'Practical', key: `${base}_Practical`, pass: rule.pass_practical, editable: rule.total_practical > 0 },
    { label: 'Total', key: `${base}_Total`, pass: rule.pass_total, editable: false }
  ].filter(c => c.editable || c.label === 'Total')

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#1e293b', fontFamily: "'Outfit', sans-serif" }}>
      <header className="responsive-header" style={{
        background: '#fff',
        padding: isMobile ? '12px 16px' : '16px 40px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        position: isMobile ? 'static' : 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: isMobile ? 'none' : '0 4px 20px rgba(15, 23, 42, 0.03)',
        backdropFilter: 'blur(10px)',
        transition: 'all 0.3s ease',
        gap: isMobile ? '12px' : '20px'
      }}>
        <div className="responsive-header-left" style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: isMobile ? '8px' : '16px',
          flex: 1,
          minWidth: 0
        }}>
          <div className="top-controls" style={{
            display: 'flex',
            gap: '8px',
            width: isMobile ? '100%' : 'auto',
            flexShrink: 0
          }}>
            <button onClick={() => navigate('/teacher-dashboard')} style={{
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              color: '#64748b',
              padding: isMobile ? '10px' : '8px 16px',
              borderRadius: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              flex: isMobile ? 1 : 'none',
              textAlign: 'center',
              height: isMobile ? '42px' : 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isMobile ? '12px' : '14px'
            }}>← EXIT</button>
            <button onClick={resetLocalMarks} style={{
              background: '#fff',
              border: '1px solid #fee2e2',
              color: '#ef4444',
              padding: isMobile ? '10px' : '8px 16px',
              borderRadius: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '12px',
              flex: isMobile ? 1 : 'none',
              textAlign: 'center',
              height: isMobile ? '42px' : 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>🔄 RESET</button>
          </div>
          <div className="switcher-container" style={{
            flex: 1,
            minWidth: 0,
            width: isMobile ? '100%' : 'auto'
          }}>
             <select className="premium-select" value={assignId} onChange={(e) => navigate(`/teacher-entry/${examId}/${e.target.value}`)} style={{
               border: '1.5px solid #e2e8f0',
               background: '#f8fafc',
               fontSize: isMobile ? '0.95rem' : '1.1rem',
               fontWeight: 800,
               color: '#0f172a',
               cursor: 'pointer',
               outline: 'none',
               padding: isMobile ? '10px 12px' : '8px 16px',
               borderRadius: '12px',
               width: '100%',
               height: isMobile ? '42px' : 'auto',
               boxShadow: isMobile ? '0 2px 5px rgba(0,0,0,0.02)' : 'none',
               textOverflow: 'ellipsis',
               transition: 'all 0.2s ease'
             }}>
                {myAssignments.map(a => (
                  <option key={(a as any).subject_code} value={(a as any).subject_code}>{(a as any).exams?.exam_name} - {(a as any).subject_name} (Class {a.class} {a.section}){(a as any).final_submitted ? ' ✓ Final Submitted' : ''}</option>
                ))}
             </select>
             <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#ec4899', fontWeight: 800, background: '#fdf2f8', padding: '6px 12px', borderRadius: '8px', border: '1px dashed #fbcfe8', display: 'inline-block', width: '100%', textAlign: 'center', boxSizing: 'border-box' }}>
               CLASS {assignment.class} • SECTION {assignment.section} • {rule.subject_name}
             </p>
          </div>
        </div>
        <div className="responsive-header-actions" style={{
          display: isMobile ? 'grid' : 'flex',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'none',
          alignItems: 'center',
          gap: isMobile ? '8px' : '12px',
          width: isMobile ? '100%' : 'auto'
        }}>
          <button onClick={() => setShowDetails(!showDetails)} style={{
            padding: isMobile ? '8px' : '8px 16px',
            borderRadius: isMobile ? '10px' : '12px',
            border: '1px solid #e2e8f0',
            background: showDetails ? '#f8fafc' : '#fff',
            color: '#64748b',
            fontSize: isMobile ? '11px' : '12px',
            fontWeight: 800,
            cursor: 'pointer',
            width: isMobile ? '100%' : 'auto',
            height: isMobile ? '40px' : 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box'
          }}>
             {showDetails ? '🙈 HIDE NAMES' : '👁️ SHOW NAMES'}
          </button>
          {assignment.final_submitted && (
            <span style={{
              padding: isMobile ? '8px' : '10px 20px',
              borderRadius: isMobile ? '10px' : '12px',
              background: '#d1fae5',
              color: '#059669',
              fontSize: isMobile ? '11px' : '13px',
              fontWeight: 800,
              border: '1px solid #a7f3d0',
              width: isMobile ? '100%' : 'auto',
              height: isMobile ? '40px' : 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box'
            }}>✔ FINAL SUBMITTED</span>
          )}
          {!isEditable && !assignment.final_submitted && (
            <span style={{
              padding: isMobile ? '8px' : '10px 20px',
              borderRadius: isMobile ? '10px' : '12px',
              background: '#fee2e2',
              color: '#ef4444',
              fontSize: isMobile ? '11px' : '13px',
              fontWeight: 800,
              border: '1px solid #fecaca',
              width: isMobile ? '100%' : 'auto',
              height: isMobile ? '40px' : 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box'
            }}>ENTRY LOCKED</span>
          )}
          {isEditable && (
            <>
              <button className="save-all-btn" onClick={saveAll} disabled={saving} style={{
                padding: isMobile ? '8px' : '10px 32px',
                borderRadius: isMobile ? '10px' : '12px',
                background: '#059669',
                color: '#fff',
                border: 'none',
                fontWeight: 800,
                cursor: 'pointer',
                width: isMobile ? '100%' : 'auto',
                height: isMobile ? '44px' : 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gridColumn: isMobile ? 'span 2' : 'auto',
                marginTop: isMobile ? '4px' : '0',
                fontSize: isMobile ? '13px' : '14px',
                boxSizing: 'border-box'
              }}>{saving ? 'সংরক্ষণ হচ্ছে...' : 'সব সংরক্ষণ করুন'}</button>
              <button className="final-submit-btn" onClick={handleFinalSubmit} disabled={saving} style={{
                padding: isMobile ? '8px' : '10px 32px',
                borderRadius: isMobile ? '10px' : '12px',
                background: '#4f46e5',
                color: '#fff',
                border: 'none',
                fontWeight: 800,
                cursor: 'pointer',
                width: isMobile ? '100%' : 'auto',
                height: isMobile ? '44px' : 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gridColumn: isMobile ? 'span 2' : 'auto',
                marginTop: isMobile ? '4px' : '0',
                fontSize: isMobile ? '13px' : '14px',
                boxSizing: 'border-box',
                boxShadow: '0 4px 10px rgba(79,70,229,0.2)'
              }}>🔒 Final Submit</button>
            </>
          )}
        </div>
      </header>

      <main className="main-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '12px 8px' : '32px 20px', transition: 'all 0.3s ease' }}>
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? '10px' : '16px', marginBottom: isMobile ? '20px' : '32px' }}>
          {[
            { label: 'শিক্ষার্থী সংখ্যা', value: data.length, icon: '👥', color: '#4f46e5' },
            { label: 'পাস মার্ক', value: rule.pass_total, icon: '🎯', color: '#059669' },
            { label: 'পূর্ণ মান', value: rule.full_marks, icon: '💯', color: '#ec4899' },
            { label: 'পরীক্ষার সাল', value: assignment.exams.year, icon: '📅', color: '#f59e0b' }
          ].map(stat => (
            <div key={stat.label} className="stats-card" style={{ 
              background: '#fff', 
              padding: isMobile ? '12px 8px' : '24px', 
              borderRadius: isMobile ? '14px' : '20px', 
              border: '1.5px solid #f97316', 
              textAlign: 'center', 
              boxShadow: '0 2px 10px rgba(0,0,0,0.01)', 
              transition: 'all 0.25s ease-in-out' 
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.borderColor = '#ea580c'
              e.currentTarget.style.boxShadow = '0 8px 20px rgba(249, 115, 22, 0.08)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.borderColor = '#f97316'
              e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.01)'
            }}
            >
               <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>{stat.label}</div>
               <div className="stats-card-value" style={{ fontSize: isMobile ? '1.4rem' : '1.8rem', fontWeight: 900, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {status && <div style={{ marginBottom: '24px', padding: '16px 24px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '16px', color: '#047857', fontWeight: 800 }}>{status}</div>}

        <div className="table-wrapper" style={{ background: '#fff', borderRadius: isMobile ? '12px' : '32px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', width: '100%', maxWidth: '100%' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%', maxWidth: '100%' }}>
            <table className={`responsive-table ${showDetails ? 'with-details' : 'no-details'}`} style={{ width: '100%', minWidth: isMobile ? (showDetails ? '640px' : '100%') : '100%', borderCollapse: 'collapse', fontSize: isMobile ? '13px' : '14px', tableLayout: 'auto' }}>
              <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: isMobile ? '10px 2px' : '20px', textAlign: 'center', width: isMobile ? '35px' : '60px', color: '#64748b', fontSize: isMobile ? '9px' : '11px', fontWeight: 800 }}>ROLL</th>
                  {showDetails && (
                    <>
                      <th style={{ padding: isMobile ? '10px 4px' : '20px', textAlign: 'left', color: '#64748b', fontSize: isMobile ? '9px' : '11px', fontWeight: 800 }}>STUDENT NAME</th>
                      <th style={{ padding: isMobile ? '10px 4px' : '20px', textAlign: 'left', color: '#64748b', fontSize: isMobile ? '9px' : '11px', fontWeight: 800 }}>IID</th>
                    </>
                  )}
                  {comps.map(c => (
                    <th key={c.key} style={{ padding: isMobile ? '10px 2px' : '20px', textAlign: 'center', color: '#64748b', fontSize: isMobile ? '9px' : '11px', fontWeight: 900, width: isMobile ? (c.editable ? '52px' : '42px') : 'auto' }}>
                       {c.label.toUpperCase()}
                       <div style={{ fontSize: '8px', color: '#ef4444', fontWeight: 800, marginTop: '2px' }}>P: {c.pass}</div>
                    </th>
                  ))}
                  <th style={{ padding: isMobile ? '10px 2px' : '20px', textAlign: 'center', width: isMobile ? '56px' : '100px', color: '#64748b', fontSize: isMobile ? '9px' : '11px', fontWeight: 800 }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, ri) => (
                  <tr key={String(row.id)} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: isMobile ? '8px 4px' : '16px', textAlign: 'center', fontWeight: 900, color: '#1e293b' }}>{String(row.roll ?? '-')}</td>
                    {showDetails && (
                      <>
                        <td style={{ padding: isMobile ? '8px 4px' : '16px', fontWeight: 700, color: '#0f172a', maxWidth: isMobile ? '110px' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(row.student_name_en ?? '-')}</td>
                        <td style={{ padding: isMobile ? '8px 4px' : '16px', fontSize: '10px', color: '#64748b', maxWidth: isMobile ? '50px' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(row.iid ?? '-')}</td>
                      </>
                    )}
                    {comps.map(c => {
                      const val = row[c.key]
                      const numVal = Number(val) || 0
                      const isFail = c.pass > 0 && numVal > 0 && numVal < c.pass
                      if (!c.editable) {
                        return <td key={c.key} style={{ padding: isMobile ? '8px 4px' : '16px', textAlign: 'center', fontWeight: 900, color: isFail ? '#ef4444' : (numVal > 0 ? '#059669' : '#cbd5e1'), fontSize: isMobile ? '14px' : '1.1rem' }}>{numVal > 0 ? numVal : '-'}</td>
                      }
                      return (
                        <td key={c.key} style={{ padding: isMobile ? '6px 2px' : '12px', textAlign: 'center' }}>
                          <input type="number" disabled={!isEditable} value={val !== null && val !== undefined ? String(val) : ''} onChange={e => {
                            handleEdit(Number(row.id), c.key, e.target.value, ri)
                            const newData = [...data]; newData[ri][c.key] = e.target.value === '' ? null : Number(e.target.value); setData(newData)
                          }} style={{ width: isMobile ? '48px' : '80px', padding: isMobile ? '5px 3px' : '10px', textAlign: 'center', borderRadius: isMobile ? '6px' : '12px', border: `2px solid ${isFail ? '#fecaca' : '#e2e8f0'}`, background: isFail ? '#fef2f2' : '#f8fafc', color: isFail ? '#ef4444' : '#0f172a', fontWeight: 800, fontSize: isMobile ? '13px' : '15px', outline: 'none' }} />
                        </td>
                      )
                    })}
                    <td className="action-cell" style={{ padding: isMobile ? '6px 2px' : '12px', textAlign: 'center' }}>
                      <button onClick={() => saveRow(Number(row.id))} disabled={savingRows[String(row.id)] === 'saving'} style={{ padding: isMobile ? '6px 6px' : '8px 16px', borderRadius: isMobile ? '6px' : '10px', border: 'none', fontWeight: 800, fontSize: isMobile ? '9px' : '11px', cursor: 'pointer', background: savingRows[String(row.id)] === 'pending' ? '#f59e0b' : savingRows[String(row.id)] === 'success' ? '#10b981' : savingRows[String(row.id)] === 'saving' ? '#94a3b8' : '#f1f5f9', color: (savingRows[String(row.id)] === 'pending' || savingRows[String(row.id)] === 'success' || savingRows[String(row.id)] === 'saving') ? '#fff' : '#64748b' }}>
                        {savingRows[String(row.id)] === 'saving' ? '...' : savingRows[String(row.id)] === 'success' ? (isMobile ? 'SAVED' : 'SAVED ✅') : 'SAVE'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
