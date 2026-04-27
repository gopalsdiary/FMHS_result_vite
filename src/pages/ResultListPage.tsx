import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import { loadExamAnn25Meta } from '@/services/examAnn25Meta'

interface Student {
  iid: string
  student_name_en: string
  father_name_en?: string
  roll?: string | number
  section: string
  class?: string | number
  gpa_final?: number | string | null
  remark?: string | null
}

export default function ResultListPage() {
  const { examId } = useParams()
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
  }, [navigate, examId])

  async function loadData() {
    setLoading(true)
    let list: Student[] = []
    let from = 0; let to = 999; let hasMore = true

    while (hasMore) {
      let query = supabase
        .from('FMHS_exam_data')
        .select('iid, student_name_en, father_name_en, roll, section, class, gpa_final, remark')
      
      if (examId) query = query.eq('exam_id', examId)
      
      const { data, error } = await query.order('roll', { ascending: true }).range(from, to)
      if (error) { setCount('Error: ' + error.message); setLoading(false); return }
      
      if (data && data.length > 0) {
        list = [...list, ...(data as Student[])]
        if (data.length < 1000) hasMore = false
        else { from += 1000; to += 1000 }
      } else { hasMore = false }
    }

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
        String(s.roll ?? '').includes(q) ||
        s.iid.toLowerCase().includes(q)
      const matchClass = !classFilter || String(s.class ?? '') === classFilter
      const matchSection = !sectionFilter || s.section === sectionFilter
      return matchSearch && matchClass && matchSection
    })
    setFiltered(result)
    setCount(`Showing ${result.length} of ${students.length} students`)
  }, [search, classFilter, sectionFilter, students])

  const sections = classFilter ? sectionsByClass[classFilter] ?? [] : Array.from(new Set(students.map(s => s.section))).sort()

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
                onClick={() => navigate(`/student-details?IID=${encodeURIComponent(s.iid)}${examId ? `&examID=${examId}` : ''}`)}
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
                  <span>Roll: {s.roll ?? '—'}</span>
                  <span>Section: {s.section}</span>
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

