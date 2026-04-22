import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import PageShell from '@/components/PageShell'

const SECTIONS = ['6A','6B','6C','7A','7B','7C','8A','8B','8C','9A','9B','10A','10B']

interface ResultRow { [key: string]: unknown }

export default function ProcessResultsPage() {
  const navigate = useNavigate()
  const [section, setSection] = useState('')
  const [rows, setRows] = useState<ResultRow[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) navigate('/login', { replace: true })
    })
  }, [navigate])

  const loadData = useCallback(async () => {
    if (!section) { setStatus('Please select a section'); return }
    setLoading(true); setStatus('Loading…')

    const { data, error } = await supabase
      .from('exam_ann25')
      .select('*')
      .eq('section_2025', section)
      .order('roll', { ascending: true })

    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    const list = data ?? []
    setRows(list as ResultRow[])
    if (list.length > 0) {
      // Show IID, name, roll first then subject columns
      const keys = Object.keys(list[0])
      const fixed = keys.filter(k => /^(iid|name|student_name|roll|section|class)/i.test(k))
      const subjectCols = keys.filter(k => !fixed.includes(k))
      setColumns([...fixed, ...subjectCols])
    }
    setStatus(`${list.length} records loaded`)
    setLoading(false)
  }, [section])

  return (
    <PageShell title="Process Results — Full View">
      {() => (
        <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
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
                {loading ? 'Loading…' : '📊 Load Results'}
              </button>
              <button className="btn btn-secondary" onClick={() => window.print()}>🖨️ Print</button>
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '10px' }}>{status}</div>}
          </div>

          {loading && <div className="spinner" />}

          {!loading && rows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ fontSize: '12px', minWidth: '800px' }}>
                <thead>
                  <tr>
                    {columns.map(col => (
                      <th key={col} style={{ whiteSpace: 'nowrap', background: '#f0f3f6', padding: '6px 8px', border: '1px solid #d0d7de', fontWeight: 600, fontSize: '11px' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      {columns.map(col => {
                        const val = row[col]
                        const isFail = typeof val === 'string' && val.toUpperCase() === 'F'
                        return (
                          <td key={col} style={{ padding: '5px 8px', border: '1px solid #e1e4e8', textAlign: 'center', color: isFail ? '#d73a49' : undefined, fontWeight: isFail ? 700 : undefined }}>
                            {val !== null && val !== undefined ? String(val) : ''}
                          </td>
                        )
                      })}
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
