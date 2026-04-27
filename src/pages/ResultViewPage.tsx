import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'

interface ResultRow { [key: string]: unknown }

export default function ResultViewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [rows, setRows] = useState<ResultRow[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const section = searchParams.get('section') ?? ''

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      loadData()
    })
  }, [navigate, section])

  async function loadData() {
    setLoading(true)
    let query = supabase.from('FMHS_exam_data').select('*')
    if (section) query = query.eq('section', section)
    const { data, error } = await query.order('roll', { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    const list = data ?? []
    setRows(list as ResultRow[])
    if (list.length > 0) {
      const keys = Object.keys(list[0])
      const fixed = keys.filter(k => /^(iid|name|student_name|roll|section|class)/i.test(k))
      const rest = keys.filter(k => !fixed.includes(k))
      setColumns([...fixed, ...rest])
    }
    setStatus(`${list.length} records`)
    setLoading(false)
  }

  return (
    <PageShell title="Result View">
      {() => (
        <div>
          <div className="card" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#6a737d', fontSize: '14px' }}>{status}</span>
            <button className="btn btn-secondary" onClick={() => window.print()}>🖨️ Print</button>
          </div>

          {loading && <div className="spinner" />}

          {!loading && rows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    {columns.map(c => <th key={c} style={{ whiteSpace: 'nowrap', fontSize: '11px', padding: '6px 8px' }}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {columns.map(col => {
                        const val = row[col]
                        const isFail = typeof val === 'string' && val.toUpperCase() === 'F'
                        return (
                          <td key={col} style={{ textAlign: 'center', padding: '5px 8px', color: isFail ? '#d73a49' : undefined, fontWeight: isFail ? 700 : undefined }}>
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

