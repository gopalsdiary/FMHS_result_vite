import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import { loadExamAnn25Meta } from '@/services/examAnn25Meta'
import PageShell from '@/layout/PageShell'

interface Student {
  iid: string
  student_name_en: string
  father_name_en?: string
  father_mobile?: string
  roll?: string | number
  class?: string | null
  section: string
  gpa_final?: number | string | null
  count_absent?: string | number | null
  class_rank?: number | null
  remark?: string | null
}

export default function StudentManagementPage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [filtered, setFiltered] = useState<Student[]>([])
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [classes, setClasses] = useState<string[]>([])
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editStudent, setEditStudent] = useState<Partial<Student>>({})
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      loadStudents()
    })
    loadExamAnn25Meta().then(meta => {
      setClasses(meta.classes)
      setSectionsByClass(meta.sectionsByClass)
    })
  }, [navigate])

  async function loadStudents() {
    setLoading(true)
    const { data, error } = await supabase
      .from('FMHS_exam_data')
      .select('iid, student_name_en, father_name_en, father_mobile, roll, class, section, gpa_final, count_absent, class_rank, remark')
      .order('section', { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    const list = (data ?? []) as Student[]
    setStudents(list)
    setFiltered(list)
    setStatus(`${list.length} students loaded`)
    setLoading(false)
  }

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(students.filter(s => {
      const matchSearch = !q || s.student_name_en.toLowerCase().includes(q) || String(s.roll ?? '').includes(q) || s.iid.toLowerCase().includes(q) || (s.father_mobile ?? '').includes(q)
      const matchClass = !classFilter || String(s.class ?? '') === classFilter
      const matchSection = !sectionFilter || s.section === sectionFilter
      return matchSearch && matchClass && matchSection
    }))
  }, [search, classFilter, sectionFilter, students])

  async function saveStudent() {
    const payload = {
      iid: String(editStudent.iid ?? '').trim(),
      student_name_en: String(editStudent.student_name_en ?? '').trim(),
      father_name_en: String(editStudent.father_name_en ?? '').trim(),
      father_mobile: String(editStudent.father_mobile ?? '').trim(),
      roll: editStudent.roll === '' || editStudent.roll === undefined ? null : editStudent.roll,
      class: String(editStudent.class ?? '').trim() || null,
      section: String(editStudent.section ?? '').trim(),
    }

    const { error } = isEditing
      ? await supabase.from('FMHS_exam_data').update(payload).eq('iid', editStudent.iid)
      : await supabase.from('FMHS_exam_data').insert(payload)

    if (error) { setStatus('Error: ' + error.message); return }
    setStatus(isEditing ? 'Updated student' : 'Added student')
    setShowModal(false)
    setEditStudent({})
    loadStudents()
  }

  async function deleteStudent(iid: string) {
    if (!confirm(`Delete student ${iid}? This cannot be undone.`)) return
    const { error } = await supabase.from('FMHS_exam_data').delete().eq('iid', iid)
    if (error) { setStatus('Error: ' + error.message); return }
    setStatus('Deleted ' + iid)
    loadStudents()
  }

  function openAdd() { setEditStudent({}); setIsEditing(false); setShowModal(true) }
  function openEdit(s: Student) { setEditStudent({ ...s }); setIsEditing(true); setShowModal(true) }

  const totalStudents = students.length
  const passCount = students.filter(s => s.gpa_final !== 'F' && s.gpa_final !== null && s.gpa_final !== undefined && s.gpa_final !== '').length
  const failCount = students.filter(s => s.gpa_final === 'F').length
  const absentCount = students.filter(s => Number(s.count_absent ?? 0) > 0).length

  return (
    <PageShell title="Student Management">
      {() => (
        <div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {[
              { label: 'Total Students', value: totalStudents, color: '#0366d6' },
              { label: 'Pass', value: passCount, color: '#1a7f37' },
              { label: 'Fail', value: failCount, color: '#d73a49' },
              { label: 'Absent', value: absentCount, color: '#ff8a00' },
            ].map(card => (
              <div key={card.label} style={{ background: '#fff', border: '1px solid #d0d7de', borderRadius: '8px', padding: '16px 24px', textAlign: 'center', minWidth: '120px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: '28px', fontWeight: 800, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: '13px', color: '#6a737d' }}>{card.label}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <input type="text" placeholder="Search name, roll, IID, mobile…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: '1 1 200px' }} />
              <select value={classFilter} onChange={e => { setClassFilter(e.target.value); setSectionFilter('') }}>
                <option value="">All Classes</option>
                {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
              </select>
              <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}>
                <option value="">All Sections</option>
                {(classFilter ? sectionsByClass[classFilter] ?? [] : Array.from(new Set(students.map(s => s.section))).sort()).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-success" onClick={openAdd}>➕ Add Student</button>
              <button className="btn btn-secondary" onClick={loadStudents}>🔄 Refresh</button>
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '10px' }}>{status}</div>}
            <div style={{ fontSize: '13px', color: '#6a737d', marginTop: '8px' }}>Showing {filtered.length} of {totalStudents} students</div>
          </div>

          {loading && <div className="spinner" />}

          {!loading && (
            <div className="card table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>IID</th><th>Student Name</th><th>Roll</th><th>Class</th><th>Section</th><th>Father Name</th><th>Mobile</th><th>GPA</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => (
                    <tr key={s.iid}>
                      <td>{i + 1}</td>
                      <td>{s.iid}</td>
                      <td style={{ fontWeight: 500 }}>{s.student_name_en}</td>
                      <td style={{ textAlign: 'center' }}>{s.roll ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>{s.class ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>{s.section}</td>
                      <td>{s.father_name_en ?? '—'}</td>
                      <td>{s.father_mobile ?? '—'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: s.gpa_final === 'F' ? '#d73a49' : '#1a7f37' }}>{String(s.gpa_final ?? '—')}</td>
                      <td>
                        <button onClick={() => openEdit(s)} style={{ fontSize: '11px', padding: '3px 8px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '4px' }}>Edit</button>
                        <button onClick={() => navigate(`/student-details?IID=${encodeURIComponent(s.iid)}`)} style={{ fontSize: '11px', padding: '3px 8px', background: '#1a7f37', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '4px' }}>View</button>
                        <button onClick={() => deleteStudent(s.iid)} style={{ fontSize: '11px', padding: '3px 8px', background: '#d73a49', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div style={{ background: '#fff', borderRadius: '10px', padding: '24px', width: '480px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}>
                <h3 style={{ margin: '0 0 20px', fontWeight: 700, color: '#24292f' }}>{isEditing ? 'Edit Student' : 'Add New Student'}</h3>
                {([['iid','IID'],['student_name_en','Student Name'],['father_name_en',"Father's Name"],['father_mobile','Father Mobile'],['roll','Roll']] as [keyof Student, string][]).map(([field, label]) => (
                  <div key={field} style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{label}</label>
                    <input type="text" value={String(editStudent[field] ?? '')} onChange={e => setEditStudent(p => ({ ...p, [field]: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' }} disabled={isEditing && field === 'iid'} />
                  </div>
                ))}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Class</label>
                  <input type="text" value={String(editStudent.class ?? '')} onChange={e => setEditStudent(p => ({ ...p, class: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Section</label>
                  <input type="text" value={String(editStudent.section ?? '')} onChange={e => setEditStudent(p => ({ ...p, section: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button onClick={() => setShowModal(false)} style={{ padding: '8px 20px', background: '#6a737d', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={saveStudent} style={{ padding: '8px 20px', background: '#1a7f37', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>💾 Save</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
