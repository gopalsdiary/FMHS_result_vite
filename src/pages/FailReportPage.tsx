import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'
import { loadExamAnn25Meta } from '@/services/examAnn25Meta'

interface FailStudent { iid: string; student_name_en: string; class: string; section: string; roll: string | number; gpa_final: string | number | null; subjects: string[] }

export default function FailReportPage() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const [classVal, setClassVal] = useState('')
  const [section, setSection] = useState('')
  const [classes, setClasses] = useState<string[]>([])
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, string[]>>({})
  const [students, setStudents] = useState<FailStudent[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) navigate('/login', { replace: true })
    })
    loadExamAnn25Meta().then(meta => {
      setClasses(meta.classes)
      setSectionsByClass(meta.sectionsByClass)
    })
  }, [navigate])

  const sectionOptions = classVal ? sectionsByClass[classVal] ?? [] : []

  const loadReport = useCallback(async () => {
    if (!classVal || !section) { setStatus('Please select class and section'); return }
    setLoading(true); setStatus('Scanning database...')

    let allData: FailStudent[] = []
    let from = 0; let to = 999; let hasMore = true
    while (hasMore) {
      let query = supabase
        .from('fmhs_exam_data')
        .select('iid, student_name_en, class, section, roll, gpa_final')
        .eq('class', classVal)
        .eq('section', section)
      
      if (examId) query = query.eq('exam_id', examId)
      
      const { data, error } = await query.order('roll', { ascending: true }).range(from, to)
      if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
      if (data && data.length > 0) {
        allData = [...allData, ...(data as FailStudent[])]
        if (data.length < 1000) hasMore = false
        else { from += 1000; to += 1000 }
      } else { hasMore = false }
    }

    const fails = allData.filter(s => String(s.gpa_final ?? '').trim().toUpperCase() === 'F' || (s.gpa_final !== null && Number(s.gpa_final) === 0 && s.gpa_final !== ''))
    setStudents(fails)
    setStatus(`${fails.length} failed student(s) in Class ${classVal} / Section ${section}`)
    setLoading(false)
  }, [classVal, section, examId])

  return (
    <PageShell title="Part 6 – Fail Report">
      {() => (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label>Class</label>
                <select value={classVal} onChange={e => { setClassVal(e.target.value); setSection(''); setStudents([]) }} style={{ minWidth: '140px' }}>
                  <option value="">Select Class</option>
                  {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
                </select>
              </div>
              <div>
                <label>Section</label>
                <select value={section} onChange={e => setSection(e.target.value)} style={{ minWidth: '140px' }}>
                  <option value="">Select Section</option>
                  {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={loadReport} disabled={loading}>
                {loading ? 'Loading…' : '🔍 Generate Report'}
              </button>
              <button className="btn btn-secondary" onClick={() => window.print()}>🖨️ Print</button>
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '10px' }}>{status}</div>}
          </div>

          {loading && <div className="spinner" />}

          {!loading && students.length > 0 && (
            <div className="card table-responsive">
              <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '12px', textAlign: 'center', color: '#d73a49' }}>
                Fail Student Report — Class {classVal} / Section {section}
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>IID</th>
                    <th>Student Name</th>
                    <th>Class</th>
                    <th>Section</th>
                    <th>Roll</th>
                    <th>GPA Final</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.iid} style={{ background: '#fff5f5' }}>
                      <td>{i + 1}</td>
                      <td>{s.iid}</td>
                      <td style={{ fontWeight: 600 }}>{s.student_name_en}</td>
                      <td>{s.class}</td>
                      <td>{s.section}</td>
                      <td>{s.roll ?? '—'}</td>
                      <td style={{ fontWeight: 700, color: '#d73a49' }}>{String(s.gpa_final ?? 'F')}</td>
                      <td style={{ color: '#d73a49', fontWeight: 600 }}>FAIL</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && students.length === 0 && section && (
            <div className="alert alert-info" style={{ textAlign: 'center', padding: '32px' }}>
              ✅ No failed students in Class {classVal} / Section {section}
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}

