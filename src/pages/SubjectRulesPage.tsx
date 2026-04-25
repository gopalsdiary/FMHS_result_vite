import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'

interface SubjectRule {
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

export default function SubjectRulesPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [examName, setExamName] = useState('')
  const [rules, setRules] = useState<SubjectRule[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [masterSubjects, setMasterSubjects] = useState<{name: string, code: string}[]>([])
  const [processing, setProcessing] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [newSub, setNewSub] = useState({
    subject_code: '',
    subject_name: '',
    full_marks: 100,
    pass_cq: 0,
    pass_mcq: 0,
    pass_practical: 0,
    pass_total: 33,
    total_cq: 70,
    total_mcq: 30,
    total_practical: 0
  })

  useEffect(() => { 
    loadData()
    loadMasterSubjects()
  }, [id])

  async function loadMasterSubjects() {
    const { data } = await supabase.from('FMHS_exam_subjects').select('subject_name, subject_code')
    if (data) {
      const unique: Record<string, string> = {}
      data.forEach(s => {
        if (s.subject_name) unique[s.subject_name] = s.subject_code
      })
      setMasterSubjects(Object.entries(unique).map(([name, code]) => ({ name, code })))
    }
  }

  async function loadData() {
    setLoading(true)
    const { data: examData } = await supabase.from('FMHS_exams_names').select('exam_name').eq('id', id).single()
    if (examData) setExamName(examData.exam_name)
    const { data, error } = await supabase.from('FMHS_exam_subjects').select('*').eq('exam_id', id).order('subject_code', { ascending: true })
    if (error) setStatus('Error: ' + error.message)
    else setRules(data || [])
    setLoading(false)
  }

  function handleSubjectNameChange(name: string) {
    const found = masterSubjects.find(s => s.name === name)
    setNewSub({
      ...newSub,
      subject_name: name,
      subject_code: found ? found.code : newSub.subject_code
    })
  }

  async function saveSubject(e: React.FormEvent) {
    e.preventDefault()
    if (!newSub.subject_code || !newSub.subject_name) return
    setProcessing(true)
    setStatus(editId ? 'Updating subject...' : 'Creating subject...')
    
    const payload = { ...newSub, exam_id: id }
    const { error } = editId 
      ? await supabase.from('FMHS_exam_subjects').update(payload).eq('id', editId)
      : await supabase.from('FMHS_exam_subjects').insert([payload])

    if (error) { alert(error.message); setProcessing(false); return }
    
    if (!editId) await addColumnsToTable(newSub)
    
    setStatus(editId ? '✅ Subject updated!' : '✅ Subject created!')
    setProcessing(false)
    setEditId(null)
    setIsModalOpen(false)
    loadData()
    setNewSub({ subject_code: '', subject_name: '', full_marks: 100, pass_cq: 0, pass_mcq: 0, pass_practical: 0, pass_total: 33, total_cq: 70, total_mcq: 30, total_practical: 0 })
    loadMasterSubjects() // Refresh list
  }

  function openAddModal() {
    setEditId(null)
    setNewSub({ subject_code: '', subject_name: '', full_marks: 100, pass_cq: 0, pass_mcq: 0, pass_practical: 0, pass_total: 33, total_cq: 70, total_mcq: 30, total_practical: 0 })
    setIsModalOpen(true)
  }

  function editRule(r: SubjectRule) {
    setEditId(r.id)
    setNewSub({
      subject_code: r.subject_code,
      subject_name: r.subject_name,
      full_marks: r.full_marks,
      pass_cq: r.pass_cq,
      pass_mcq: r.pass_mcq,
      pass_practical: r.pass_practical,
      pass_total: r.pass_total,
      total_cq: r.total_cq,
      total_mcq: r.total_mcq,
      total_practical: r.total_practical
    })
    setIsModalOpen(true)
  }

  async function addColumnsToTable(sub: typeof newSub) {
    const base = `*${sub.subject_name.trim()}`
    const cols: string[] = []
    if (sub.total_cq > 0) cols.push(`add column if not exists "${base}_CQ" numeric`)
    if (sub.total_mcq > 0) cols.push(`add column if not exists "${base}_MCQ" numeric`)
    if (sub.total_practical > 0) cols.push(`add column if not exists "${base}_Practical" numeric`)
    cols.push(`add column if not exists "${base}_Total" numeric`)
    cols.push(`add column if not exists "${base}_GPA" text`)
    for (const sql of cols) { await supabase.rpc('execute_sql', { query: `alter table fmhs_exam_data ${sql}` }) }
  }

  async function deleteRule(rid: number, name: string) {
    if (!confirm(`Remove "${name}"?`)) return
    const { error } = await supabase.from('FMHS_exam_subjects').delete().eq('id', rid)
    if (error) alert(error.message)
    else loadData()
  }

  if (loading) return <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#1e293b', fontFamily: "'Outfit', sans-serif" }}>
      <header style={{ background: '#fff', padding: '20px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={() => navigate(`/exam-panel/${id}`)} style={{ background: '#f1f5f9', border: 'none', color: '#64748b', borderRadius: '12px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>← Back</button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900 }}>Subject Rules</h1>
            <p style={{ margin: 0, fontSize: '11px', color: '#4f46e5', fontWeight: 800 }}>{examName.toUpperCase()}</p>
          </div>
        </div>
        <button onClick={openAddModal} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '14px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)' }}>+ Add Subject</button>
      </header>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ background: '#fff', padding: '32px', borderRadius: '32px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.03)' }}>
           <h2 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             Subject Configuration List
             <span style={{ fontSize: '12px', background: '#4f46e5', padding: '6px 16px', borderRadius: '20px', color: '#fff' }}>{rules.length} Subjects</span>
           </h2>

           <div style={{ overflowX: 'auto' }}>
             <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
               <thead>
                 <tr style={{ textAlign: 'left' }}>
                   <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Code</th>
                   <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Subject Name</th>
                   <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'center' }}>CQ</th>
                   <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'center' }}>MCQ</th>
                   <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'center' }}>Prac</th>
                   <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'center' }}>Pass</th>
                   <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                 </tr>
               </thead>
               <tbody>
                 {rules.map(r => (
                   <tr key={r.id} className="subject-row" style={{ background: '#fff', transition: 'all 0.2s' }}>
                     <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f1f5f9', borderRadius: '16px 0 0 16px' }}>
                       <span style={{ fontWeight: 800, color: '#4f46e5', background: '#eef2ff', padding: '4px 10px', borderRadius: '8px' }}>{r.subject_code}</span>
                     </td>
                     <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', fontWeight: 800, fontSize: '1rem' }}>
                       {r.subject_name}
                     </td>
                     <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{r.total_cq}</td>
                     <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{r.total_mcq}</td>
                     <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{r.total_practical}</td>
                     <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                       <span style={{ background: '#f0fdf4', color: '#166534', padding: '4px 12px', borderRadius: '8px', fontWeight: 800, fontSize: '12px' }}>{r.pass_total}</span>
                     </td>
                     <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', borderRadius: '0 16px 16px 0', textAlign: 'right' }}>
                       <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                         <button onClick={() => editRule(r)} style={{ background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer', transition: '0.2s' }}>✏️</button>
                         <button onClick={() => deleteRule(r.id, r.subject_name)} style={{ background: '#fff1f2', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer', transition: '0.2s' }}>🗑️</button>
                       </div>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
           {rules.length === 0 && (
             <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
               <div style={{ fontSize: '40px', marginBottom: '16px' }}>📚</div>
               <p>No subjects configured yet. Click "Add Subject" to start.</p>
             </div>
           )}
        </div>
      </main>

      {/* Modal Overlay */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: '540px', borderRadius: '40px', padding: '40px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)', animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, color: '#0f172a' }}>{editId ? '📝 Edit Subject' : '✨ Add New Subject'}</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Configure marks and rules for this subject</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}>✕</button>
            </div>
            
            <form onSubmit={saveSubject}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', marginBottom: '28px' }}>
                <div className="form-group">
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Code</label>
                  <input className="form-control" style={{ borderRadius: '16px', padding: '12px 16px', fontSize: '1rem', fontWeight: 700 }} value={newSub.subject_code} onChange={e => setNewSub({...newSub, subject_code: e.target.value})} required placeholder="e.g. 101" />
                </div>
                <div className="form-group">
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject Name</label>
                  <input 
                    list="master-subjects"
                    className="form-control" 
                    style={{ borderRadius: '16px', padding: '12px 16px', fontSize: '1rem', fontWeight: 700 }} 
                    value={newSub.subject_name} 
                    onChange={e => handleSubjectNameChange(e.target.value)} 
                    required 
                    placeholder="Search or type name..." 
                  />
                  <datalist id="master-subjects">
                    {masterSubjects.map(s => (
                      <option key={s.name} value={s.name}>{s.code}</option>
                    ))}
                  </datalist>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '28px', borderRadius: '32px', border: '1px solid #e2e8f0', marginBottom: '28px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                   <h4 style={{ margin: 0, fontSize: '12px', color: '#4f46e5', fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase' }}>📊 Marks & Pass Distribution</h4>
                   <span style={{ fontSize: '11px', background: '#eef2ff', color: '#4f46e5', padding: '4px 12px', borderRadius: '20px', fontWeight: 800 }}>
                     Total Full Marks: {newSub.total_cq + newSub.total_mcq + newSub.total_practical}
                   </span>
                 </div>
                 
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                    {/* CQ Section */}
                    <div style={{ background: '#fff', padding: '16px', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#64748b', marginBottom: '8px', textAlign: 'center' }}>CQ</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                          <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700 }}>FULL</span>
                          <input type="number" className="form-control" style={{ borderRadius: '10px', textAlign: 'center', fontWeight: 700, padding: '8px' }} value={newSub.total_cq} onChange={e => setNewSub({...newSub, total_cq: Number(e.target.value)})} />
                        </div>
                        <div>
                          <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: 700 }}>PASS</span>
                          <input type="number" className="form-control" style={{ borderRadius: '10px', textAlign: 'center', fontWeight: 700, padding: '8px', border: '1px solid #fecaca' }} value={newSub.pass_cq} onChange={e => setNewSub({...newSub, pass_cq: Number(e.target.value)})} />
                        </div>
                      </div>
                    </div>

                    {/* MCQ Section */}
                    <div style={{ background: '#fff', padding: '16px', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#64748b', marginBottom: '8px', textAlign: 'center' }}>MCQ</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                          <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700 }}>FULL</span>
                          <input type="number" className="form-control" style={{ borderRadius: '10px', textAlign: 'center', fontWeight: 700, padding: '8px' }} value={newSub.total_mcq} onChange={e => setNewSub({...newSub, total_mcq: Number(e.target.value)})} />
                        </div>
                        <div>
                          <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: 700 }}>PASS</span>
                          <input type="number" className="form-control" style={{ borderRadius: '10px', textAlign: 'center', fontWeight: 700, padding: '8px', border: '1px solid #fecaca' }} value={newSub.pass_mcq} onChange={e => setNewSub({...newSub, pass_mcq: Number(e.target.value)})} />
                        </div>
                      </div>
                    </div>

                    {/* PRAC Section */}
                    <div style={{ background: '#fff', padding: '16px', borderRadius: '20px', border: '1px solid #f1f5f9' }}>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#64748b', marginBottom: '8px', textAlign: 'center' }}>PRAC</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                          <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 700 }}>FULL</span>
                          <input type="number" className="form-control" style={{ borderRadius: '10px', textAlign: 'center', fontWeight: 700, padding: '8px' }} value={newSub.total_practical} onChange={e => setNewSub({...newSub, total_practical: Number(e.target.value)})} />
                        </div>
                        <div>
                          <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: 700 }}>PASS</span>
                          <input type="number" className="form-control" style={{ borderRadius: '10px', textAlign: 'center', fontWeight: 700, padding: '8px', border: '1px solid #fecaca' }} value={newSub.pass_practical} onChange={e => setNewSub({...newSub, pass_practical: Number(e.target.value)})} />
                        </div>
                      </div>
                    </div>
                 </div>
              </div>

              <div style={{ background: '#fff9eb', padding: '24px', borderRadius: '28px', border: '1px solid #fef3c7', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                 <div style={{ background: '#fef3c7', width: '48px', height: '48px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🎯</div>
                 <div style={{ flex: 1 }}>
                   <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#92400e', marginBottom: '4px', textTransform: 'uppercase' }}>Passing Threshold</label>
                   <input type="number" className="form-control" style={{ borderRadius: '14px', border: '2px solid #fcd34d', fontWeight: 800, fontSize: '1.1rem' }} value={newSub.pass_total} onChange={e => setNewSub({...newSub, pass_total: Number(e.target.value)})} />
                 </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '20px', background: '#f1f5f9', border: 'none', fontWeight: 800, cursor: 'pointer', color: '#64748b', fontSize: '14px', transition: '0.2s' }}>CANCEL</button>
                <button className="btn btn-primary" disabled={processing} style={{ flex: 2, padding: '16px', borderRadius: '20px', background: '#4f46e5', border: 'none', fontWeight: 800, color: '#fff', fontSize: '14px', boxShadow: '0 10px 20px -5px rgba(79, 70, 229, 0.4)', cursor: 'pointer', transition: '0.2s' }}>
                  {processing ? 'SAVING...' : (editId ? 'UPDATE SUBJECT' : 'CREATE SUBJECT')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .form-control:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
        }
      `}</style>
    </div>
  )
}

