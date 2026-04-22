import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import PageShell from '@/components/PageShell'
import { loadExamAnn25Meta } from '@/lib/examAnn25Meta'

interface Student {
  iid: string
  class_2025?: string
  section_2025?: string
  student_name_en?: string
  roll_2025?: string | number
  total_mark?: number
  average_mark?: number
  gpa_final?: string
  remark?: string
}

function buildSms(s: Student, customMsg: string): string {
  const name = s.student_name_en ?? 'Student'
  const roll = s.roll_2025 ?? ''
  const totalNum = Number(s.total_mark ?? 0)
  if (!name || totalNum <= 0) return ''
  const gpa = s.gpa_final ?? ''
  const total = s.total_mark ?? ''
  const avg = s.average_mark ?? ''
  const remark = s.remark ?? ''
  const base = `FMHS Result 2025\nName: ${name}\nRoll: ${roll}\nTotal: ${total} | Avg: ${avg} | GPA: ${gpa} | ${remark}`
  return customMsg ? base + '\n' + customMsg : base
}

export default function SmsPage() {
  const navigate = useNavigate()
  const [classVal, setClassVal] = useState('')
  const [section, setSection] = useState('')
  const [classes, setClasses] = useState<string[]>([])
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, string[]>>({})
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [customMsg, setCustomMsg] = useState('')
  const [preview, setPreview] = useState('')
  const [selectedIid, setSelectedIid] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
    })
    loadExamAnn25Meta().then(meta => {
      setClasses(meta.classes)
      setSectionsByClass(meta.sectionsByClass)
    })
  }, [navigate])

  const sectionOptions = classVal ? sectionsByClass[classVal] ?? [] : []
  const visibleStudents = students.filter(s => Number(s.total_mark ?? 0) > 0)

  async function load() {
    if (!classVal || !section) { setStatus('Select class and section'); return }
    setLoading(true)
    const { data, error } = await supabase.from('exam_ann25').select('iid, class_2025, section_2025, student_name_en, roll_2025, total_mark, average_mark, gpa_final, remark').eq('class_2025', classVal).eq('section_2025', section).order('roll_2025', { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    const list = (data ?? []) as Student[]
    const resultList = list.filter(s => Number(s.total_mark ?? 0) > 0)
    setStudents(list)
    setStatus(`${resultList.length} students with results`)
    setLoading(false)
  }

  function showPreview(s: Student) {
    setSelectedIid(s.iid)
    setPreview(buildSms(s, customMsg))
  }

  function copyAll() {
    const text = visibleStudents.map(s => buildSms(s, customMsg)).filter(Boolean).join('\n---\n')
    navigator.clipboard.writeText(text).then(() => setStatus('Copied all SMS to clipboard!'))
  }

  function exportCsv() {
    const rows = visibleStudents.map(s => [
      `"${s.student_name_en ?? ''}"`,
      `"${s.class_2025 ?? ''}"`,
      `"${s.section_2025 ?? ''}"`,
      `"${s.roll_2025 ?? ''}"`,
      `"${s.total_mark ?? ''}"`,
      `"${s.average_mark ?? ''}"`,
      `"${s.gpa_final ?? ''}"`,
      `"${s.remark ?? ''}"`,
      `"${buildSms(s, customMsg).replace(/"/g, '""')}"`
    ])
    const csv = ['Name,Class,Section,Roll,Total,Average,GPA,Remark,SMS', ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `sms_${section}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageShell title="SMS Generator">
      {() => (
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          {/* Controls */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label>Class</label>
                <select value={classVal} onChange={e => { setClassVal(e.target.value); setSection(''); setStudents([]); setPreview('') }} style={{ minWidth: '120px' }}>
                  <option value="">Select</option>
                  {classes.map(c => <option key={c} value={c}>Class {c}</option>)}
                </select>
              </div>
              <div>
                <label>Section</label>
                <select value={section} onChange={e => setSection(e.target.value)} style={{ minWidth: '120px' }}>
                  <option value="">Select</option>
                  {sectionOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={load} disabled={loading}>{loading ? 'Loading…' : '📊 Load'}</button>
            </div>
            <div style={{ marginTop: '12px' }}>
              <label>Custom Message (optional — appended to each SMS)</label>
              <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)} rows={2} style={{ width: '100%', maxWidth: '600px', fontSize: '13px' }} placeholder="e.g. Congratulations! Contact school: 01234..." />
            </div>
            {students.length > 0 && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={copyAll}>📋 Copy All SMS</button>
                <button className="btn btn-success" onClick={exportCsv}>⬇ Export CSV</button>
              </div>
            )}
            {status && <div className="alert alert-info" style={{ marginTop: '8px' }}>{status}</div>}
          </div>

          {/* Preview */}
          {preview && (
            <div className="card" style={{ marginBottom: '16px', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
              <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '13px' }}>SMS Preview</div>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '13px', fontFamily: 'monospace', margin: 0 }}>{preview}</pre>
            </div>
          )}

          {/* Student List */}
          {loading && <div className="spinner" />}
          {!loading && visibleStudents.length > 0 && (
            <div className="card table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Class</th><th>Section</th><th>Roll</th><th>Name</th><th>Total</th><th>Avg</th><th>GPA</th><th>Remark</th><th>Preview</th><th>Copy</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStudents.map(s => (
                    <tr key={s.iid} style={{ background: s.iid === selectedIid ? '#eff6ff' : undefined }}>
                      <td style={{ textAlign: 'center' }}>{s.class_2025}</td>
                      <td style={{ textAlign: 'center' }}>{s.section_2025}</td>
                      <td style={{ textAlign: 'center' }}>{s.roll_2025}</td>
                      <td style={{ fontWeight: 500 }}>{s.student_name_en}</td>
                      <td style={{ textAlign: 'center' }}>{s.total_mark}</td>
                      <td style={{ textAlign: 'center' }}>{s.average_mark}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: s.gpa_final === 'F' ? '#d73a49' : '#1a7f37' }}>{s.gpa_final}</td>
                      <td>{s.remark}</td>
                      <td>
                        <button onClick={() => showPreview(s)} style={{ fontSize: '11px', padding: '3px 8px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Preview</button>
                      </td>
                      <td>
                        <button onClick={() => navigator.clipboard.writeText(buildSms(s, customMsg))} style={{ fontSize: '11px', padding: '3px 8px', background: '#6a737d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Copy</button>
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
