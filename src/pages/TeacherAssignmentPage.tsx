import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'

interface Assignment {
  id: number
  teacher_email: string
  class: number
  section: string
  subject_code: string
}

interface Subject {
  subject_code: string
  subject_name: string
}

export default function TeacherAssignmentPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [examName, setExamName] = useState('')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  const [newAssign, setNewAssign] = useState({
    teacher_email: '',
    class: 6,
    section: 'A',
    subject_code: ''
  })

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    setLoading(true)
    const { data: examData } = await supabase.from('FMHS_exams_names').select('exam_name').eq('id', id).single()
    if (examData) setExamName(examData.exam_name)
    const { data: subs } = await supabase.from('FMHS_exam_subjects').select('subject_code, subject_name').eq('exam_id', id)
    setSubjects(subs || [])
    if (subs && subs.length > 0 && !newAssign.subject_code) setNewAssign(prev => ({ ...prev, subject_code: subs[0].subject_code }))
    const { data, error } = await supabase.from('FMHS_exam_teacher_assignments').select('*').eq('exam_id', id).order('class', { ascending: true })
    if (error) setStatus('Error: ' + error.message)
    else setAssignments(data || [])
    setLoading(false)
  }

  async function addAssignment(e: React.FormEvent) {
    e.preventDefault()
    if (!newAssign.teacher_email || !newAssign.subject_code) return
    const { error } = await supabase.from('FMHS_exam_teacher_assignments').insert([{ ...newAssign, exam_id: id }])
    if (error) setStatus('Error: ' + error.message)
    else { setStatus('✅ Assigned successfully!'); loadData() }
  }

  async function deleteAssignment(aid: number) {
    if (!confirm('Remove assignment?')) return
    const { error } = await supabase.from('FMHS_exam_teacher_assignments').delete().eq('id', aid)
    if (error) alert(error.message)
    else loadData()
  }

  if (loading) return <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#1e293b', fontFamily: "'Outfit', sans-serif" }}>
      <header style={{ background: '#fff', padding: '20px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={() => navigate(`/exam-panel/${id}`)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: '12px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>← Back</button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900 }}>Teacher Access</h1>
            <p style={{ margin: 0, fontSize: '11px', color: '#ec4899', fontWeight: 800 }}>{examName.toUpperCase()}</p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px', display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '32px' }}>
        <div style={{ background: '#fff', padding: '32px', borderRadius: '32px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '24px' }}>Assign Teacher</h2>
          <form onSubmit={addAssignment}>
            <div style={{ marginBottom: '20px' }}><label style={{ fontSize: '11px', fontWeight: 800 }}>EMAIL</label><input type="email" className="form-control" style={{ borderRadius: '12px' }} value={newAssign.teacher_email} onChange={e => setNewAssign({...newAssign, teacher_email: e.target.value})} required /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div><label style={{ fontSize: '11px', fontWeight: 800 }}>CLASS</label><select className="form-control" style={{ borderRadius: '12px' }} value={newAssign.class} onChange={e => setNewAssign({...newAssign, class: Number(e.target.value)})}>{[1,2,3,4,5,6,7,8,9,10,11,12].map(c => <option key={c} value={c}>Class {c}</option>)}</select></div>
              <div><label style={{ fontSize: '11px', fontWeight: 800 }}>SECTION</label><select className="form-control" style={{ borderRadius: '12px' }} value={newAssign.section} onChange={e => setNewAssign({...newAssign, section: e.target.value})}>{['A', 'B', 'C', 'D', 'Rose', 'Lotus', 'None'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: '32px' }}><label style={{ fontSize: '11px', fontWeight: 800 }}>SUBJECT</label><select className="form-control" style={{ borderRadius: '12px' }} value={newAssign.subject_code} onChange={e => setNewAssign({...newAssign, subject_code: e.target.value})}>{subjects.map(s => <option key={s.subject_code} value={s.subject_code}>{s.subject_name}</option>)}</select></div>
            <button className="btn btn-primary" style={{ width: '100%', padding: '16px', borderRadius: '16px', background: '#ec4899', border: 'none', fontWeight: 800 }}>GRANT ACCESS</button>
          </form>
        </div>

        <div style={{ background: '#fff', padding: '32px', borderRadius: '32px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
           <h2 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '24px' }}>Active Access</h2>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {assignments.map(a => (
                <div key={a.id} style={{ padding: '20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: 0, fontWeight: 800 }}>{a.teacher_email}</h4>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Class: {a.class} | Section: {a.section} | Subject: {a.subject_code}</div>
                  </div>
                  <button onClick={() => deleteAssignment(a.id)} style={{ background: '#fee2e2', color: '#ef4444', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}>🗑️</button>
                </div>
              ))}
           </div>
        </div>
      </main>
    </div>
  )
}

