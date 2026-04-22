import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { loadExamAnn25Meta } from '@/lib/examAnn25Meta'

interface Student {
  iid: string
  student_name_en: string
  father_name_en?: string
  roll_2025?: string | number
  section_2025: string
  class_2025?: string | number
  gpa_final?: number | string | null
  remark?: string | null
}

export default function ResultListPage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [filtered, setFiltered] = useState<Student[]>([])
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [classes, setClasses] = useState<string[]>([])
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [count, setCount] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      loadData()
    })
    loadExamAnn25Meta().then(meta => {
      setClasses(meta.classes)
      setSectionsByClass(meta.sectionsByClass)
    })
  }, [navigate])

  async function loadData() {
    setLoading(true)
    const { data, error } = await supabase
      .from('exam_ann25')
      .select('iid, student_name_en, father_name_en, roll_2025, section_2025, class_2025, gpa_final, remark')
      .order('roll_2025', { ascending: true })
    if (error) { setCount('Error: ' + error.message); setLoading(false); return }
    const list = (data ?? []) as Student[]
    setStudents(list)
    setFiltered(list)
    setCount(`${list.length} students loaded`)
    setLoading(false)
  }

  useEffect(() => {
    const q = search.toLowerCase()
    const result = students.filter(s => {
      const matchSearch = !q ||
        s.student_name_en.toLowerCase().includes(q) ||
        String(s.roll_2025 ?? '').includes(q) ||
        s.iid.toLowerCase().includes(q)
      const matchClass = !classFilter || String(s.class_2025 ?? '') === classFilter
      const matchSection = !sectionFilter || s.section_2025 === sectionFilter
      return matchSearch && matchClass && matchSection
    })
    setFiltered(result)
    setCount(`Showing ${result.length} of ${students.length} students`)
  }, [search, classFilter, sectionFilter, students])

  const sections = classFilter ? sectionsByClass[classFilter] ?? [] : Array.from(new Set(students.map(s => s.section_2025))).sort()

  return (
    <div style={{ fontFamily: 'var(--font-family)', background: '#f8fafc', minHeight: '100vh' }}>
      <div className="app-header">
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#2c3e50' }}>
          Feni Model High School — Annual Examination Report Card 2025
        </h1>
      </div>

      <div style={{ maxWidth: '1000px', margin: '24px auto', padding: '0 16px' }}>
        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <input
            type="text"
            placeholder="Search by Name, Roll, IID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: '1 1 240px', padding: '10px 14px', border: '1px solid #ddd', borderRadius: '6px' }}
          />
          <select value={classFilter} onChange={e => setClassFilter(e.target.value)} style={{ padding: '10px 14px', border: '1px solid #ddd', borderRadius: '6px' }}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
          </select>
          <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)} style={{ padding: '10px 14px', border: '1px solid #ddd', borderRadius: '6px' }}>
            <option value="">All Sections</option>
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading && <div className="spinner" />}

        {/* Student cards */}
        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(s => (
              <div
                key={s.iid}
                onClick={() => navigate(`/student-details?IID=${encodeURIComponent(s.iid)}`)}
                style={{
                  background: '#fff', borderRadius: '8px', padding: '16px 20px', cursor: 'pointer',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.08)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderLeft: '4px solid #2c3e50', transition: 'all 0.2s',
                }}
              >
                <div style={{ fontWeight: 600, color: '#2c3e50', flex: 2 }}>{s.student_name_en}</div>
                <div style={{ display: 'flex', gap: '24px', flex: 3, justifyContent: 'space-between', color: '#666', fontSize: '0.9rem' }}>
                  <span>IID: {s.iid}</span>
                  <span>Roll: {s.roll_2025 ?? '—'}</span>
                  <span>Section: {s.section_2025}</span>
                  <span style={{ fontWeight: 600, color: s.gpa_final === 'F' ? '#d32f2f' : '#388e3c' }}>
                    GPA: {s.gpa_final ?? '—'}
                  </span>
                </div>
                <span style={{ color: '#3498db', fontSize: '0.9rem', fontWeight: 500 }}>View →</span>
              </div>
            ))}
          </div>
        )}

        {/* Count */}
        <div style={{ textAlign: 'center', marginTop: '20px', padding: '16px', background: '#f8f9fa', borderRadius: '8px', color: '#666' }}>
          {count}
        </div>
      </div>
    </div>
  )
}
