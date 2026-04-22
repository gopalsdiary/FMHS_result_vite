import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { loadExamAnn25Meta } from '@/lib/examAnn25Meta'

interface SubjectComp { CQ?: string; MCQ?: string; Practical?: string; Total?: string; GPA?: string }
interface StudentRow { [key: string]: unknown }

export default function ResultEntryAdminPage() {
  const navigate = useNavigate()
  const [cls, setCls] = useState('')
  const [section, setSection] = useState('')
  const [subject, setSubject] = useState('')
  const [subjects, setSubjects] = useState<Map<string, SubjectComp>>(new Map())
  const [students, setStudents] = useState<StudentRow[]>([])
  const [iidCol, setIidCol] = useState('iid')
  const [classes, setClasses] = useState<string[]>([])
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const editRef = useRef<Record<string, Record<string, unknown>>>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      detectColumns()
    })
  }, [navigate])

  async function detectColumns() {
    const { data: sampleRows } = await supabase.from('exam_ann25').select('*').limit(1)
    if (sampleRows?.length) {
      const keys = Object.keys(sampleRows[0])
      const ic = keys.find(k => /^iid$/i.test(k)) ?? 'iid'; setIidCol(ic)
      const smap = new Map<string, SubjectComp>()
      keys.forEach(k => {
        const m = k.match(/^\*?(.+?)_(CQ|MCQ|Practical|Total|GPA)$/i)
        if (m) {
          const base = m[1].trim()
          const comp = m[2].toUpperCase() as keyof SubjectComp
          if (!smap.has(base)) smap.set(base, {})
          smap.get(base)![comp] = k
        }
      })
      setSubjects(smap)
    }

    const meta = await loadExamAnn25Meta()
    setClasses(meta.classes)
    setSectionsByClass(meta.sectionsByClass)
  }

  const loadStudents = useCallback(async () => {
    if (!cls || !section || !subject) { setStatus('Select class, section and subject'); return }
    setLoading(true); setStatus('Loading…')
    const { data, error } = await supabase.from('exam_ann25').select('*').eq('class_2025', cls).eq('section_2025', section).order(iidCol, { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    setStudents((data ?? []) as StudentRow[])
    editRef.current = {}
    setStatus(`${data?.length ?? 0} students loaded for Class ${cls} / Section ${section}`)
    setLoading(false)
  }, [cls, section, subject, iidCol])

  useEffect(() => { if (section && subject) loadStudents() }, [section, subject, loadStudents])

  function handleEdit(iid: string, col: string, value: string) {
    if (!editRef.current[iid]) editRef.current[iid] = {}
    editRef.current[iid][col] = value === '' ? null : Number(value)
  }

  async function saveAll() {
    setStatus('Saving…')
    let done = 0
    const comps = subjects.get(subject)
    for (const row of students) {
      const iid = String(row[iidCol] ?? '')
      const edits = editRef.current[iid]
      if (!edits || Object.keys(edits).length === 0) continue
      if (comps?.Total) {
        const cq = Number(edits[comps.CQ ?? ''] ?? row[comps.CQ ?? '']) || 0
        const mcq = Number(edits[comps.MCQ ?? ''] ?? row[comps.MCQ ?? '']) || 0
        const pr = Number(edits[comps.Practical ?? ''] ?? row[comps.Practical ?? '']) || 0
        const total = cq + mcq + pr
        if (total > 0) edits[comps.Total] = total
      }
      const { error } = await supabase.from('exam_ann25').update(edits).eq(iidCol, iid)
      if (!error) done++
    }
    setStatus(`Saved ${done} records`)
    loadStudents()
  }

  const comps = subjects.get(subject)
  const sections = cls ? sectionsByClass[cls] ?? [] : []

  return (
    <div style={{ fontFamily: 'var(--font-family)', background: '#f6f8fa', minHeight: '100vh' }}>
      <div style={{ background: '#1a1a2e', color: '#fff', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Result Entry — Admin</h1>
        <a href="/dashboard" style={{ color: '#ccc', fontSize: '13px', textDecoration: 'none' }}>← Dashboard</a>
      </div>

      <div style={{ padding: '16px' }}>
        <div style={{ background: '#fff', padding: '14px 16px', borderRadius: '6px', border: '1px solid #d0d7de', marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px' }}>Class</label>
              <select value={cls} onChange={e => { setCls(e.target.value); setSection('') }}>
                <option value="">Select</option>
                {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px' }}>Section</label>
              <select value={section} onChange={e => setSection(e.target.value)}>
                <option value="">Select</option>
                {sections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#555', marginBottom: '4px' }}>Subject</label>
              <select value={subject} onChange={e => setSubject(e.target.value)} style={{ minWidth: '200px' }}>
                <option value="">Select Subject</option>
                {Array.from(subjects.keys()).sort().map(s => <option key={s} value={s}>{s.replace(/^\*+\s*/, '')}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={loadStudents} style={{ padding: '6px 12px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }} disabled={loading}>
              {loading ? 'Loading…' : '📊 Load Students'}
            </button>
            <button onClick={saveAll} style={{ padding: '6px 12px', background: '#1a7f37', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }} disabled={students.length === 0}>
              💾 Save All Changes
            </button>
          </div>
          {status && <div style={{ marginTop: '8px', fontSize: '13px', color: '#6a737d' }}>{status}</div>}
        </div>

        {loading && <div className="spinner" />}
        {!loading && students.length > 0 && comps && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                  <th style={{ border: '1px solid #444', padding: '8px', textAlign: 'center' }}>IID</th>
                  <th style={{ border: '1px solid #444', padding: '8px' }}>Name</th>
                  <th style={{ border: '1px solid #444', padding: '8px', textAlign: 'center' }}>Class</th>
                  <th style={{ border: '1px solid #444', padding: '8px', textAlign: 'center' }}>Section</th>
                  <th style={{ border: '1px solid #444', padding: '8px', textAlign: 'center' }}>Roll</th>
                  {comps.CQ && <th style={{ border: '1px solid #444', padding: '8px', textAlign: 'center' }}>CQ</th>}
                  {comps.MCQ && <th style={{ border: '1px solid #444', padding: '8px', textAlign: 'center' }}>MCQ</th>}
                  {comps.Practical && <th style={{ border: '1px solid #444', padding: '8px', textAlign: 'center' }}>Practical</th>}
                  {comps.Total && <th style={{ border: '1px solid #444', padding: '8px', textAlign: 'center' }}>Total</th>}
                  {comps.GPA && <th style={{ border: '1px solid #444', padding: '8px', textAlign: 'center' }}>GPA</th>}
                </tr>
              </thead>
              <tbody>
                {students.map((row, ri) => {
                  const iid = String(row[iidCol] ?? '')
                  const classCol = Object.keys(row).find(k => /class_2025/i.test(k)) ?? 'class_2025'
                  const sectionCol = Object.keys(row).find(k => /section_2025/i.test(k)) ?? 'section_2025'
                  const nameCol = Object.keys(row).find(k => /student_name_en/i.test(k)) ?? Object.keys(row).find(k => /student_name|name/i.test(k)) ?? 'student_name_en'
                  const rollCol = Object.keys(row).find(k => /roll_2025/i.test(k)) ?? 'roll_2025'
                  return (
                    <tr key={iid} style={{ background: ri % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px', textAlign: 'center' }}>{iid}</td>
                      <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px' }}>{String(row[nameCol] ?? '')}</td>
                      <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px', textAlign: 'center' }}>{String(row[classCol] ?? '')}</td>
                      <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px', textAlign: 'center' }}>{String(row[sectionCol] ?? '')}</td>
                      <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px', textAlign: 'center' }}>{String(row[rollCol] ?? '')}</td>
                      {comps.CQ && <td style={{ border: '1px solid #e1e4e8', padding: '2px' }}><input type="number" defaultValue={row[comps.CQ!] !== null && row[comps.CQ!] !== undefined ? String(row[comps.CQ!]) : ''} onChange={e => handleEdit(iid, comps.CQ!, e.target.value)} style={{ width: '60px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', textAlign: 'center', fontSize: '12px' }} /></td>}
                      {comps.MCQ && <td style={{ border: '1px solid #e1e4e8', padding: '2px' }}><input type="number" defaultValue={row[comps.MCQ!] !== null && row[comps.MCQ!] !== undefined ? String(row[comps.MCQ!]) : ''} onChange={e => handleEdit(iid, comps.MCQ!, e.target.value)} style={{ width: '60px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', textAlign: 'center', fontSize: '12px' }} /></td>}
                      {comps.Practical && <td style={{ border: '1px solid #e1e4e8', padding: '2px' }}><input type="number" defaultValue={row[comps.Practical!] !== null && row[comps.Practical!] !== undefined ? String(row[comps.Practical!]) : ''} onChange={e => handleEdit(iid, comps.Practical!, e.target.value)} style={{ width: '60px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px', textAlign: 'center', fontSize: '12px' }} /></td>}
                      {comps.Total && <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px', textAlign: 'center', fontWeight: 600 }}>{row[comps.Total!] !== null ? String(row[comps.Total!]) : ''}</td>}
                      {comps.GPA && <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px', textAlign: 'center', fontWeight: 600, color: row[comps.GPA!] === 'F' ? '#d73a49' : '#0366d6' }}>{row[comps.GPA!] !== null ? String(row[comps.GPA!]) : ''}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
