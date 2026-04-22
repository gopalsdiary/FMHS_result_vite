import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'

interface Student {
  iid: string
  student_name_en: string
  father_name_en?: string
  father_mobile?: string
  roll_2025?: string | number
  section_2025: string
  gpa_final?: number | string | null
}

const SECTIONS = ['6A','6B','6C','7A','7B','7C','8A','8B','8C','9A','9B','10A','10B']

export default function DataListPage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [filtered, setFiltered] = useState<Student[]>([])
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      loadData()
    })
  }, [navigate])

  async function loadData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('exam_ann25')
      .select('iid, student_name_en, father_name_en, father_mobile, roll_2025, section_2025, gpa_final')
      .order('roll_2025', { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    const list = (data ?? []) as Student[]
    setStudents(list); setFiltered(list)
    setStatus(`${list.length} students`)
    setLoading(false)
  }

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(students.filter(s => {
      const matchSearch = !q || s.student_name_en.toLowerCase().includes(q) || String(s.roll_2025 ?? '').includes(q) || s.iid.toLowerCase().includes(q) || (s.father_mobile ?? '').includes(q)
      const matchSection = !sectionFilter || s.section_2025 === sectionFilter
      return matchSearch && matchSection
    }))
  }, [search, sectionFilter, students])

  function exportCSV() {
    const headers = ['IID','Student Name','Father Name','Roll','Mobile','Section','GPA']
    const rows = filtered.map(s => [s.iid, s.student_name_en, s.father_name_en ?? '', String(s.roll_2025 ?? ''), s.father_mobile ?? '', s.section_2025, String(s.gpa_final ?? '')])
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'students_data.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageShell title="Student Data List">
      {() => (
        <div>
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <input type="text" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: '1 1 200px' }} />
              <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}>
                <option value="">All Sections</option>
                {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-success" onClick={exportCSV}>📥 Export CSV</button>
              <button className="btn btn-secondary" onClick={loadData}>🔄 Refresh</button>
            </div>
            <div style={{ fontSize: '13px', color: '#6a737d', marginTop: '8px' }}>{status} — showing {filtered.length}</div>
          </div>

          {loading && <div className="spinner" />}

          {!loading && (
            <div className="card table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>IID</th><th>Student Name</th><th>Father Name</th><th>Roll</th><th>Mobile</th><th>Section</th><th>GPA</th><th>View</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={s.iid}>
                      <td>{i + 1}</td>
                      <td>{s.iid}</td>
                      <td style={{ fontWeight: 500 }}>{s.student_name_en}</td>
                      <td>{s.father_name_en ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>{s.roll_2025 ?? '—'}</td>
                      <td>{s.father_mobile ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>{s.section_2025}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: s.gpa_final === 'F' ? '#d73a49' : '#1a7f37' }}>{String(s.gpa_final ?? '—')}</td>
                      <td>
                        <button onClick={() => navigate(`/student-details?IID=${encodeURIComponent(s.iid)}`)} style={{ fontSize: '11px', padding: '3px 8px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                          View →
                        </button>
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
