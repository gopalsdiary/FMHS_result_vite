import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import PageShell from '@/components/PageShell'

const SECTIONS = ['6A','6B','6C','7A','7B','7C','8A','8B','8C','9A','9B','10A','10B']

interface StudentGpa {
  index: number
  iid: string
  student_name_en: string
  roll_2025: string | number
  total_mark: number | null
  average_mark: number | null
  count_absent: string | number | null
  gpa_final: number | string | null
  remark: string | null
  class_rank: number | null
  subjects: SubjectGpa[]
}

interface SubjectGpa { subject: string; gpa: number | string | null }

export default function GpaFinalPage() {
  const navigate = useNavigate()
  const [section, setSection] = useState('')
  const [students, setStudents] = useState<StudentGpa[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) navigate('/login', { replace: true })
    })
  }, [navigate])

  const loadData = useCallback(async () => {
    if (!section) { setStatus('Please select a section'); return }
    setLoading(true); setStatus('Loading…')

    const { data: studRows, error: studErr } = await supabase
      .from('exam_ann25')
      .select('iid, student_name_en, roll_2025, total_mark, average_mark, count_absent, gpa_final, remark, class_rank')
      .eq('section_2025', section)
      .order('roll_2025', { ascending: true })

    if (studErr) { setStatus('Error: ' + studErr.message); setLoading(false); return }

    const studentList = (studRows ?? []) as StudentGpa[]
    const studentMap: StudentGpa[] = studentList.map((s, i) => ({ ...s, index: i, subjects: [] }))
    setStudents(studentMap)
    setStatus(`Loaded ${studentMap.length} students`)
    setLoading(false)
  }, [section])

  async function updateStudent(student: StudentGpa) {
    const { error } = await supabase
      .from('exam_ann25')
      .update({
        gpa_final: student.gpa_final,
        remark: student.remark,
        class_rank: student.class_rank,
        total_mark: student.total_mark,
        average_mark: student.average_mark,
      })
      .eq('iid', student.iid)

    if (error) setStatus('Error updating ' + student.iid + ': ' + error.message)
    else { setStatus('Updated ' + student.iid); setEditingIndex(null) }
  }

  async function updateAllRanks() {
    setStatus('Computing ranks…')
    const sorted = [...students].sort((a, b) => {
      const ga = typeof a.gpa_final === 'number' ? a.gpa_final : 0
      const gb = typeof b.gpa_final === 'number' ? b.gpa_final : 0
      if (gb !== ga) return gb - ga
      return (b.total_mark ?? 0) - (a.total_mark ?? 0)
    })
    const updated: StudentGpa[] = sorted.map((s, i) => ({ ...s, class_rank: i + 1 }))
    setStudents(updated)
    let done = 0
    for (const s of updated) {
      const { error } = await supabase.from('exam_ann25').update({ class_rank: s.class_rank }).eq('iid', s.iid)
      if (!error) done++
    }
    setStatus(`Ranked ${done} students`)
  }

  return (
    <PageShell title="Part 4 – GPA Finalization">
      {() => (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Controls */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label>Section</label>
                <select value={section} onChange={e => setSection(e.target.value)} style={{ minWidth: '140px' }}>
                  <option value="">Select Section</option>
                  {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={loadData} disabled={loading}>
                {loading ? 'Loading…' : '📊 Load'}
              </button>
              <button className="btn btn-success" onClick={updateAllRanks} disabled={students.length === 0}>
                🏆 Calculate & Save Ranks
              </button>
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '10px' }}>{status}</div>}
          </div>

          {students.length > 0 && (
            <div className="card table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>IID</th>
                    <th>Student Name</th>
                    <th>Roll</th>
                    <th>Total Mark</th>
                    <th>Average</th>
                    <th>GPA Final</th>
                    <th>Rank</th>
                    <th>Remark</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.iid}>
                      <td>{i + 1}</td>
                      <td>{s.iid}</td>
                      <td>{s.student_name_en}</td>
                      <td>{s.roll_2025 ?? '—'}</td>
                      <td>
                        {editingIndex === i
                          ? <input type="number" defaultValue={s.total_mark ?? ''} onBlur={e => { const updated = [...students]; updated[i] = { ...s, total_mark: Number(e.target.value) }; setStudents(updated) }} style={{ width: '70px' }} />
                          : s.total_mark ?? '—'}
                      </td>
                      <td>
                        {editingIndex === i
                          ? <input type="number" defaultValue={s.average_mark ?? ''} onBlur={e => { const updated = [...students]; updated[i] = { ...s, average_mark: Number(e.target.value) }; setStudents(updated) }} style={{ width: '70px' }} />
                          : s.average_mark ?? '—'}
                      </td>
                      <td style={{ fontWeight: 600, color: s.gpa_final === 'F' ? '#d73a49' : '#1a7f37' }}>
                        {editingIndex === i
                          ? <input type="text" defaultValue={String(s.gpa_final ?? '')} onBlur={e => { const updated = [...students]; updated[i] = { ...s, gpa_final: e.target.value }; setStudents(updated) }} style={{ width: '60px' }} />
                          : String(s.gpa_final ?? '—')}
                      </td>
                      <td>{s.class_rank ?? '—'}</td>
                      <td>
                        {editingIndex === i
                          ? <input type="text" defaultValue={s.remark ?? ''} onBlur={e => { const updated = [...students]; updated[i] = { ...s, remark: e.target.value }; setStudents(updated) }} style={{ width: '120px' }} />
                          : s.remark ?? '—'}
                      </td>
                      <td>
                        {editingIndex === i ? (
                          <>
                            <button onClick={() => updateStudent(students[i])} style={{ fontSize: '11px', padding: '3px 7px', background: '#1a7f37', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '4px' }}>💾 Save</button>
                            <button onClick={() => setEditingIndex(null)} style={{ fontSize: '11px', padding: '3px 7px', background: '#6a737d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setEditingIndex(i)} style={{ fontSize: '11px', padding: '3px 7px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✏️ Edit</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
