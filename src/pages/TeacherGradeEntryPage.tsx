import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'

interface Assignment {
  id: number
  exam_id: number
  class: number
  section: string
  subject_code: string
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
    const { data: allAssigns } = await supabase
      .from('FMHS_exam_teacher_selection')
      .select('*, exams:FMHS_exams_names(exam_name, year, is_live, teacher_entry_enabled)')
      .eq('teacher_email_id', user.email)
      .not('exam_id', 'is', null)
    
    if (allAssigns) setMyAssignments(allAssigns as any[])

    const { data: assign } = await supabase
      .from('FMHS_exam_teacher_selection')
      .select('*, exams:FMHS_exams_names(exam_name, year, is_live, teacher_entry_enabled)')
      .eq('subject_code', assignId)
      .eq('exam_id', examId)
      .single()

    if (!assign) { setStatus('Assignment not found'); setLoading(false); return }
    setAssignment(assign as any)

    const { data: rData } = await supabase
      .from('FMHS_exam_subjects').select('*')
      .eq('exam_id', examId).eq('subject_code', String(assign.subject_code)).single()
    if (rData) setRule(rData)

    // Also try to get the subject name from FMHS_subject_map for display
    const subjectName = (assign as any).subject_name ?? rData?.subject_name ?? ''

    const { data: rows } = await supabase
      .from('fmhs_exam_data').select('*')
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
    
    const { error } = await supabase.from('fmhs_exam_data').update(editRef.current[rowId]).eq('id', rowId)
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
      const { error } = await supabase.from('fmhs_exam_data').update(edits).eq('id', rowId)
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

  const isEditable = assignment.exams.is_live && assignment.exams.teacher_entry_enabled
  const base = `*${rule.subject_name}`
  const comps: { label: string; key: string; pass: number; total: number; editable: boolean }[] = []
  if (rule.total_cq > 0) comps.push({ label: 'CQ', key: `${base}_CQ`, pass: rule.pass_cq, total: rule.total_cq, editable: true })
  if (rule.total_mcq > 0) comps.push({ label: 'MCQ', key: `${base}_MCQ`, pass: rule.pass_mcq, total: rule.total_mcq, editable: true })
  if (rule.total_practical > 0) comps.push({ label: 'Practical', key: `${base}_Practical`, pass: rule.pass_practical, total: rule.total_practical, editable: true })
  comps.push({ label: 'Total', key: `${base}_Total`, pass: rule.pass_total, total: rule.full_marks, editable: false })

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#1e293b', fontFamily: "'Outfit', sans-serif" }}>
      <header style={{ background: '#fff', padding: '16px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button onClick={() => navigate('/teacher-dashboard')} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#64748b', padding: '8px 16px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>← EXIT</button>
          <button onClick={resetLocalMarks} style={{ background: '#fff', border: '1px solid #fee2e2', color: '#ef4444', padding: '8px 16px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>🔄 RESET</button>
          <div>
             <select value={assignId} onChange={(e) => navigate(`/teacher-entry/${examId}/${e.target.value}`)} style={{ border: 'none', background: 'transparent', fontSize: '1.2rem', fontWeight: 900, color: '#0f172a', cursor: 'pointer', outline: 'none' }}>
                {myAssignments.map(a => (
                  <option key={(a as any).subject_code} value={(a as any).subject_code}>{(a as any).exams?.exam_name} - {(a as any).subject_name} (Class {a.class} {a.section})</option>
                ))}
             </select>
             <p style={{ margin: 0, fontSize: '11px', color: '#ec4899', fontWeight: 800 }}>CLASS {assignment.class} • SECTION {assignment.section} • {rule.subject_name}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setShowDetails(!showDetails)} style={{ padding: '8px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: showDetails ? '#f8fafc' : '#fff', color: '#64748b', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}>
             {showDetails ? '🙈 HIDE NAMES' : '👁️ SHOW NAMES'}
          </button>
          {!isEditable && <span style={{ padding: '10px 20px', borderRadius: '12px', background: '#fee2e2', color: '#ef4444', fontSize: '13px', fontWeight: 800, border: '1px solid #fecaca' }}>ENTRY LOCKED</span>}
          <button onClick={saveAll} disabled={saving || !isEditable} style={{ padding: '10px 32px', borderRadius: '12px', background: isEditable ? '#059669' : '#94a3b8', color: '#fff', border: 'none', fontWeight: 800, cursor: isEditable ? 'pointer' : 'not-allowed' }}>{saving ? 'সংরক্ষণ হচ্ছে...' : 'সব সংরক্ষণ করুন'}</button>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
          {[
            { label: 'শিক্ষার্থী সংখ্যা', value: data.length, icon: '👥', color: '#4f46e5' },
            { label: 'পাস মার্ক', value: rule.pass_total, icon: '🎯', color: '#059669' },
            { label: 'পূর্ণ মান', value: rule.full_marks, icon: '💯', color: '#ec4899' },
            { label: 'পরীক্ষার সাল', value: assignment.exams.year, icon: '📅', color: '#f59e0b' }
          ].map(stat => (
            <div key={stat.label} style={{ background: '#fff', padding: '24px', borderRadius: '24px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
               <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase' }}>{stat.label}</div>
               <div style={{ fontSize: '1.8rem', fontWeight: 900, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {status && <div style={{ marginBottom: '24px', padding: '16px 24px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '16px', color: '#047857', fontWeight: 800 }}>{status}</div>}

        <div style={{ background: '#fff', borderRadius: '32px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '20px', textAlign: 'center', width: '60px', color: '#64748b', fontSize: '11px', fontWeight: 800 }}>ROLL</th>
                  {showDetails && (
                    <>
                      <th style={{ padding: '20px', textAlign: 'left', color: '#64748b', fontSize: '11px', fontWeight: 800 }}>STUDENT NAME</th>
                      <th style={{ padding: '20px', textAlign: 'left', color: '#64748b', fontSize: '11px', fontWeight: 800 }}>IID</th>
                    </>
                  )}
                  {comps.map(c => (
                    <th key={c.key} style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '11px', fontWeight: 900 }}>
                       {c.label.toUpperCase()}
                       <div style={{ fontSize: '9px', color: '#ef4444', fontWeight: 800, marginTop: '2px' }}>P: {c.pass}</div>
                    </th>
                  ))}
                  <th style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '11px', fontWeight: 800 }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, ri) => (
                  <tr key={String(row.id)} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px', textAlign: 'center', fontWeight: 900, color: '#1e293b' }}>{String(row.roll ?? '-')}</td>
                    {showDetails && (
                      <>
                        <td style={{ padding: '16px', fontWeight: 700, color: '#0f172a' }}>{String(row.student_name_en ?? '-')}</td>
                        <td style={{ padding: '16px', fontSize: '11px', color: '#64748b' }}>{String(row.iid ?? '-')}</td>
                      </>
                    )}
                    {comps.map(c => {
                      const val = row[c.key]
                      const numVal = Number(val) || 0
                      const isFail = c.pass > 0 && numVal > 0 && numVal < c.pass
                      if (!c.editable) {
                        return <td key={c.key} style={{ padding: '16px', textAlign: 'center', fontWeight: 900, color: isFail ? '#ef4444' : (numVal > 0 ? '#059669' : '#cbd5e1'), fontSize: '1.1rem' }}>{numVal > 0 ? numVal : '-'}</td>
                      }
                      return (
                        <td key={c.key} style={{ padding: '12px', textAlign: 'center' }}>
                          <input type="number" disabled={!isEditable} value={val !== null && val !== undefined ? String(val) : ''} onChange={e => {
                            handleEdit(Number(row.id), c.key, e.target.value, ri)
                            const newData = [...data]; newData[ri][c.key] = e.target.value === '' ? null : Number(e.target.value); setData(newData)
                          }} style={{ width: '80px', padding: '10px', textAlign: 'center', borderRadius: '12px', border: `2px solid ${isFail ? '#fecaca' : '#e2e8f0'}`, background: isFail ? '#fef2f2' : '#f8fafc', color: isFail ? '#ef4444' : '#0f172a', fontWeight: 800, fontSize: '15px', outline: 'none' }} />
                        </td>
                      )
                    })}
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button onClick={() => saveRow(Number(row.id))} disabled={savingRows[String(row.id)] === 'saving'} style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', fontWeight: 800, fontSize: '11px', cursor: 'pointer', background: savingRows[String(row.id)] === 'pending' ? '#f59e0b' : savingRows[String(row.id)] === 'success' ? '#10b981' : savingRows[String(row.id)] === 'saving' ? '#94a3b8' : '#f1f5f9', color: (savingRows[String(row.id)] === 'pending' || savingRows[String(row.id)] === 'success' || savingRows[String(row.id)] === 'saving') ? '#fff' : '#64748b' }}>
                        {savingRows[String(row.id)] === 'saving' ? '...' : savingRows[String(row.id)] === 'success' ? 'SAVED ✅' : 'SAVE'}
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
