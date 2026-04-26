import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'

interface Exam {
  id: number
  exam_name: string
  year: number
  is_live: boolean
  teacher_entry_enabled: boolean
  created_at: string
  class_6: number
  class_7: number
  class_8: number
  class_9: number
  class_10: number
  class_11: number
  class_12: number
}

export default function ExamManagerPage() {
  const navigate = useNavigate()
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  
  // Form state
  const [newName, setNewName] = useState('')
  const [newYear, setNewYear] = useState(new Date().getFullYear())
  const [classCounts, setClassCounts] = useState<Record<number, number>>({
    6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      loadExams()
    })
  }, [navigate])

  async function loadExams() {
    setLoading(true)
    const { data, error } = await supabase
      .from('FMHS_exams_names')
      .select('*')
      .order('year', { ascending: false })
      .order('created_at', { ascending: false })
    
    if (error) {
      setStatus('Error: ' + error.message)
    } else {
      setExams(data || [])
    }
    setLoading(false)
  }

  async function createExam(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    
    setStatus('Creating...')
    const { error } = await supabase.from('FMHS_exams_names').insert([
      { 
        exam_name: newName.trim(), 
        year: newYear,
        class_6: classCounts[6],
        class_7: classCounts[7],
        class_8: classCounts[8],
        class_9: classCounts[9],
        class_10: classCounts[10],
        class_11: classCounts[11],
        class_12: classCounts[12],
      }
    ])

    if (error) {
      setStatus('Error: ' + error.message)
    } else {
      setStatus('Exam created successfully!')
      setNewName('')
      loadExams()
    }
  }

  async function toggleStatus(id: number, field: 'is_live' | 'teacher_entry_enabled', currentVal: boolean) {
    const { error } = await supabase
      .from('FMHS_exams_names')
      .update({ [field]: !currentVal })
      .eq('id', id)
    
    if (error) {
      setStatus('Error: ' + error.message)
    } else {
      loadExams()
    }
  }

  async function deleteExam(id: number, examName: string) {
    // Check if any marks exist for this exam
    const { count } = await supabase
      .from('fmhs_exam_data')
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', id)
    
    if (count && count > 0) {
      alert(`❌ ডিলিট করা যাচ্ছে না!\n\n"${examName}" পরীক্ষায় ${count} জন শিক্ষার্থীর ডাটা আছে।\nআগে সব ডাটা মুছে তারপর ডিলিট করুন।`)
      return
    }

    if (!confirm(`"${examName}" পরীক্ষাটি ডিলিট করতে চান?`)) return
    
    // Also delete subject rules and teacher assignments
    await supabase.from('FMHS_exam_subjects').delete().eq('exam_id', id)
    await supabase.from('FMHS_exam_teacher_selection').delete().eq('exam_id', id)
    
    const { error } = await supabase.from('FMHS_exams_names').delete().eq('id', id)
    if (error) {
      setStatus('Error: ' + error.message)
    } else {
      setStatus('Exam deleted!')
      loadExams()
    }
  }

  return (
    <PageShell title="Exam Manager">
      {() => (
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
          
          {/* Create Exam Form */}
          <div className="card" style={{ marginBottom: '30px', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#1e293b' }}>Create New Exam</h3>
            <form onSubmit={createExam} style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600, color: '#64748b' }}>Exam Name</label>
                <input 
                  type="text" 
                  className="form-control"
                  value={newName} 
                  onChange={e => setNewName(e.target.value)} 
                  placeholder="e.g. Half Yearly Examination" 
                  required
                />
              </div>
              <div style={{ width: '120px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600, color: '#64748b' }}>Year</label>
                <input 
                  type="number" 
                  className="form-control"
                  value={newYear} 
                  onChange={e => setNewYear(Number(e.target.value))} 
                  required
                />
              </div>
              <div style={{ width: '100%', marginTop: '8px' }}>
                <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', fontWeight: 800, color: '#475569' }}>Total Subjects for GPA (Per Class)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '12px' }}>
                  {[6, 7, 8, 9, 10, 11, 12].map(c => (
                    <div key={c}>
                      <div style={{ fontSize: '11px', fontWeight: 900, color: '#94a3b8', textAlign: 'center', marginBottom: '4px' }}>Class {c}</div>
                      <input 
                        type="number" 
                        className="form-control" 
                        style={{ textAlign: 'center', borderRadius: '10px', fontSize: '13px', fontWeight: 800 }}
                        value={classCounts[c]}
                        onChange={e => setClassCounts({ ...classCounts, [c]: Number(e.target.value) })}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="submit" className="btn btn-primary" style={{ padding: '12px 32px', borderRadius: '14px', fontWeight: 900 }}>
                  + Create New Examination
                </button>
              </div>
            </form>
            {status && <p style={{ marginTop: '12px', fontSize: '14px', color: status.startsWith('Error') ? '#ef4444' : '#10b981' }}>{status}</p>}
          </div>

          {/* Exams List */}
          <h3 style={{ marginBottom: '20px', color: '#1e293b' }}>Existing Exams</h3>
          
          {loading ? (
            <div className="spinner" />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
              {exams.map(exam => (
                <div key={exam.id} className="card" style={{ padding: '20px', borderRadius: '16px', transition: 'transform 0.2s', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#0366d6', background: '#eff6ff', padding: '2px 8px', borderRadius: '12px' }}>
                      {exam.year}
                    </span>
                    <button 
                      onClick={() => deleteExam(exam.id, exam.exam_name)} 
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                      title="Delete Exam"
                    >
                      🗑️
                    </button>
                  </div>
                  
                  <h4 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: '#1e293b' }}>{exam.exam_name}</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', color: '#475569' }}>Live Status</span>
                      <button 
                        onClick={() => toggleStatus(exam.id, 'is_live', exam.is_live)}
                        style={{ 
                          padding: '4px 12px', 
                          borderRadius: '20px', 
                          fontSize: '12px', 
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: 'none',
                          background: exam.is_live ? '#dcfce7' : '#fee2e2',
                          color: exam.is_live ? '#15803d' : '#b91c1c'
                        }}
                      >
                        {exam.is_live ? '● Live' : '○ Offline'}
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', color: '#475569' }}>Teacher Entry</span>
                      <button 
                        onClick={() => toggleStatus(exam.id, 'teacher_entry_enabled', exam.teacher_entry_enabled)}
                        style={{ 
                          padding: '4px 12px', 
                          borderRadius: '20px', 
                          fontSize: '12px', 
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: 'none',
                          background: exam.teacher_entry_enabled ? '#dcfce7' : '#fee2e2',
                          color: exam.teacher_entry_enabled ? '#15803d' : '#b91c1c'
                        }}
                      >
                        {exam.teacher_entry_enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                  </div>

                  {/* Config Links */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <Link 
                      to={`/exam-subjects/${exam.id}`} 
                      className="btn btn-secondary" 
                      style={{ fontSize: '12px', padding: '8px', textAlign: 'center', textDecoration: 'none', borderRadius: '8px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}
                    >
                      📚 Subject Rules
                    </Link>
                    <Link 
                      to={`/exam-teachers/${exam.id}`} 
                      className="btn btn-secondary" 
                      style={{ fontSize: '12px', padding: '8px', textAlign: 'center', textDecoration: 'none', borderRadius: '8px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}
                    >
                      👤 Teachers
                    </Link>
                  </div>
                  
                  <Link 
                    to={`/exam-panel/${exam.id}`} 
                    className="btn btn-primary" 
                    style={{ display: 'block', textAlign: 'center', textDecoration: 'none', borderRadius: '8px' }}
                  >
                    Open Exam Panel →
                  </Link>
                </div>
              ))}
              {exams.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: '#64748b', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>
                  No exams found. Create your first exam above!
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}

