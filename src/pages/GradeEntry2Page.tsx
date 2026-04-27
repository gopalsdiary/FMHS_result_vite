import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'

const SECTIONS = ['6A','6B','6C','7A','7B','7C','8A','8B','8C','9A','9B','10A','10B']

interface Student { iid: string; student_name_en: string; roll: string | number; total_mark: number | null; average_mark: number | null; gpa_final: number | string | null; remark: string | null }

export default function GradeEntry2Page() {
  const navigate = useNavigate()
  const [section, setSection] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) navigate('/login', { replace: true })
    })
  }, [navigate])

  async function loadData() {
    if (!section) { setStatus('Please select a section'); return }
    setLoading(true); setStatus('Loading…')
    const { data, error } = await supabase
      .from('FMHS_exam_data')
      .select('iid, student_name_en, roll, total_mark, average_mark, gpa_final, remark')
      .eq('section', section)
      .order('roll', { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    setStudents((data ?? []) as Student[])
    setStatus(`${data?.length ?? 0} students loaded`)
    setLoading(false)
  }

  function update(index: number, field: keyof Student, value: string) {
    const updated = [...students]
    ;(updated[index] as unknown as Record<string, unknown>)[field] = value
    setStudents(updated)
  }

  async function saveRow(index: number) {
    const s = students[index]
    const { error } = await supabase.from('FMHS_exam_data')
      .update({ total_mark: s.total_mark, average_mark: s.average_mark, gpa_final: s.gpa_final, remark: s.remark })
      .eq('iid', s.iid)
    setStatus(error ? 'Error: ' + error.message : `Saved ${s.student_name_en}`)
  }

  async function saveAll() {
    setStatus('Saving all…')
    let done = 0
    for (const s of students) {
      const { error } = await supabase.from('FMHS_exam_data')
        .update({ total_mark: s.total_mark, average_mark: s.average_mark, gpa_final: s.gpa_final, remark: s.remark })
        .eq('iid', s.iid)
      if (!error) done++
    }
    setStatus(`Saved ${done}/${students.length} students`)
  }

  return (
    <PageShell title="Grade Entry (Part 2) — Students">
      {() => (
        <div>
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label>Section</label>
                <select value={section} onChange={e => setSection(e.target.value)} style={{ minWidth: '140px' }}>
                  <option value="">Select Section</option>
                  {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={loadData} disabled={loading}>Load</button>
              <button className="btn btn-success" onClick={saveAll} disabled={students.length === 0}>💾 Save All</button>
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '10px' }}>{status}</div>}
          </div>

          {loading && <div className="spinner" />}

          {!loading && students.length > 0 && (
            <div className="card table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>IID</th><th>Student Name</th><th>Roll</th>
                    <th>Total Mark</th><th>Average</th><th>GPA Final</th><th>Remark</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.iid}>
                      <td>{i + 1}</td>
                      <td>{s.iid}</td>
                      <td>{s.student_name_en}</td>
                      <td>{s.roll ?? '—'}</td>
                      <td><input type="number" value={s.total_mark ?? ''} onChange={e => update(i, 'total_mark', e.target.value)} style={{ width: '80px' }} /></td>
                      <td><input type="number" value={s.average_mark ?? ''} onChange={e => update(i, 'average_mark', e.target.value)} style={{ width: '80px' }} /></td>
                      <td><input type="text" value={String(s.gpa_final ?? '')} onChange={e => update(i, 'gpa_final', e.target.value)} style={{ width: '70px' }} /></td>
                      <td><input type="text" value={s.remark ?? ''} onChange={e => update(i, 'remark', e.target.value)} style={{ width: '120px' }} /></td>
                      <td><button onClick={() => saveRow(i)} className="btn btn-primary" style={{ fontSize: '11px', padding: '4px 8px' }}>Save</button></td>
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

