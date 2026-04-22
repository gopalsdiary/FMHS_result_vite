import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import PageShell from '@/components/PageShell'

const SECTIONS = ['6A','6B','6C','7A','7B','7C','8A','8B','8C','9A','9B','10A','10B']

interface StudentFull {
  iid: string
  student_name_en?: string
  roll_2025?: string
  section_2025?: string
  total_mark?: number
  average_mark?: number
  gpa_final?: string
  remark?: string
  class_rank?: number
  father_name_en?: string
  father_mobile?: string
  [key: string]: unknown
}

function buildFullSms(s: StudentFull, customMsg: string): string {
  const lines = [
    'FMHS Annual Result 2025',
    `Name: ${s.student_name_en ?? ''}`,
    s.father_name_en ? `Father: ${s.father_name_en}` : '',
    `Section: ${s.section_2025 ?? ''} | Roll: ${s.roll_2025 ?? ''}`,
    `Rank: ${s.class_rank ?? ''}`,
    `Total: ${s.total_mark ?? ''} | Avg: ${s.average_mark ?? ''}`,
    `GPA: ${s.gpa_final ?? ''} | Result: ${s.remark ?? ''}`,
  ].filter(Boolean)
  if (customMsg) lines.push(customMsg)
  return lines.join('\n')
}

export default function SmsFullPage() {
  const navigate = useNavigate()
  const [section, setSection] = useState('')
  const [students, setStudents] = useState<StudentFull[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [customMsg, setCustomMsg] = useState('')
  const [preview, setPreview] = useState('')
  const [selectedIid, setSelectedIid] = useState('')
  const [showAllCols, setShowAllCols] = useState(false)
  const [allCols, setAllCols] = useState<string[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
    })
  }, [navigate])

  async function load() {
    if (!section) { setStatus('Select section'); return }
    setLoading(true)
    const { data, error } = await supabase.from('exam_ann25').select('*').eq('section_2025', section).order('roll_2025', { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    const rows = (data ?? []) as StudentFull[]
    setStudents(rows)
    if (rows.length > 0) setAllCols(Object.keys(rows[0]).filter(k => !k.startsWith('__')))
    setStatus(`${rows.length} students`)
    setLoading(false)
  }

  function copyAll() {
    const text = students.map(s => buildFullSms(s, customMsg)).join('\n---\n')
    navigator.clipboard.writeText(text).then(() => setStatus('Copied all to clipboard!'))
  }

  function exportCsv() {
    if (!allCols.length) return
    const rows = students.map(s => allCols.map(col => `"${String(s[col] ?? '').replace(/"/g, '""')}"`))
    const csv = [allCols.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `sms_full_${section}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <PageShell title="Full SMS Generator">
      {() => (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label>Section</label>
                <select value={section} onChange={e => setSection(e.target.value)} style={{ minWidth: '120px' }}>
                  <option value="">Select</option>
                  {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={load} disabled={loading}>{loading ? 'Loading…' : '📊 Load'}</button>
            </div>
            <div style={{ marginTop: '12px' }}>
              <label>Custom Footer Message</label>
              <textarea value={customMsg} onChange={e => setCustomMsg(e.target.value)} rows={2} style={{ width: '100%', maxWidth: '600px', fontSize: '13px' }} placeholder="e.g. School contact: 01234..." />
            </div>
            {students.length > 0 && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button className="btn btn-secondary" onClick={copyAll}>📋 Copy All</button>
                <button className="btn btn-success" onClick={exportCsv}>⬇ Export CSV</button>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showAllCols} onChange={e => setShowAllCols(e.target.checked)} /> Show all columns
                </label>
              </div>
            )}
            {status && <div className="alert alert-info" style={{ marginTop: '8px' }}>{status}</div>}
          </div>

          {preview && (
            <div className="card" style={{ marginBottom: '16px', background: '#f0f9ff' }}>
              <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '13px' }}>SMS Preview</div>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '13px', fontFamily: 'monospace', margin: 0 }}>{preview}</pre>
            </div>
          )}

          {loading && <div className="spinner" />}

          {!loading && students.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', background: '#fff', fontSize: '13px', width: '100%' }}>
                <thead>
                  <tr style={{ background: '#0d1117', color: '#fff' }}>
                    <th style={{ border: '1px solid #444', padding: '8px', whiteSpace: 'nowrap' }}>Roll</th>
                    <th style={{ border: '1px solid #444', padding: '8px', whiteSpace: 'nowrap' }}>Name</th>
                    <th style={{ border: '1px solid #444', padding: '8px', whiteSpace: 'nowrap' }}>Total</th>
                    <th style={{ border: '1px solid #444', padding: '8px', whiteSpace: 'nowrap' }}>Avg</th>
                    <th style={{ border: '1px solid #444', padding: '8px', whiteSpace: 'nowrap' }}>GPA</th>
                    <th style={{ border: '1px solid #444', padding: '8px', whiteSpace: 'nowrap' }}>Rank</th>
                    <th style={{ border: '1px solid #444', padding: '8px', whiteSpace: 'nowrap' }}>Remark</th>
                    {showAllCols && allCols.filter(c => !['roll_2025','student_name_en','total_mark','average_mark','gpa_final','class_rank','remark','iid','section_2025'].includes(c)).map(c => (
                      <th key={c} style={{ border: '1px solid #444', padding: '8px', whiteSpace: 'nowrap', fontSize: '11px' }}>{c}</th>
                    ))}
                    <th style={{ border: '1px solid #444', padding: '8px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, ri) => (
                    <tr key={s.iid} style={{ background: s.iid === selectedIid ? '#eff6ff' : ri % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px', textAlign: 'center' }}>{s.roll_2025}</td>
                      <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>{s.student_name_en}</td>
                      <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px', textAlign: 'center' }}>{s.total_mark}</td>
                      <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px', textAlign: 'center' }}>{s.average_mark}</td>
                      <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px', textAlign: 'center', fontWeight: 600, color: s.gpa_final === 'F' ? '#d73a49' : '#1a7f37' }}>{s.gpa_final}</td>
                      <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px', textAlign: 'center' }}>{s.class_rank}</td>
                      <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px' }}>{s.remark}</td>
                      {showAllCols && allCols.filter(c => !['roll','student_name','total_mark','average_mark','gpa_final','class_rank','remark','iid'].includes(c)).map(c => (
                        <td key={c} style={{ border: '1px solid #e1e4e8', padding: '4px 8px', fontSize: '11px' }}>{String(s[c] ?? '')}</td>
                      ))}
                      <td style={{ border: '1px solid #e1e4e8', padding: '4px 8px' }}>
                        <button onClick={() => { setSelectedIid(s.iid); setPreview(buildFullSms(s, customMsg)) }} style={{ fontSize: '11px', padding: '3px 8px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '4px' }}>Preview</button>
                        <button onClick={() => navigator.clipboard.writeText(buildFullSms(s, customMsg))} style={{ fontSize: '11px', padding: '3px 8px', background: '#6a737d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Copy</button>
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
