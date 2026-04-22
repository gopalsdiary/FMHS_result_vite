import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'

interface StudentResult { [key: string]: unknown }

export default function DetailsResultPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const iid = searchParams.get('IID') ?? ''
  const [result, setResult] = useState<StudentResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!iid) { setError('No IID provided'); setLoading(false); return }
    supabase.from('exam_ann25').select('*').eq('iid', iid).limit(1).then(({ data, error: err }) => {
      if (err || !data?.length) { setError(err?.message ?? 'Not found'); setLoading(false); return }
      setResult(data[0] as StudentResult); setLoading(false)
    })
  }, [iid])

  if (loading) return <div style={{ textAlign: 'center', padding: '60px' }}><div className="spinner" /></div>
  if (error || !result) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#d73a49' }}>
      <p>{error}</p>
      <button onClick={() => navigate(-1)} className="btn btn-primary">← Back</button>
    </div>
  )

  const pairs = Object.entries(result).filter(([k]) => !k.startsWith('_'))

  return (
    <div style={{ maxWidth: '800px', margin: '24px auto', padding: '0 16px', fontFamily: 'var(--font-family)' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => navigate(-1)} className="btn btn-secondary">← Back</button>
        <button onClick={() => window.print()} className="btn btn-primary">🖨️ Print</button>
      </div>
      <div className="card">
        <h2 style={{ marginBottom: '16px' }}>Detailed Result — {String(result.student_name ?? result.name ?? iid)}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {pairs.map(([key, val]) => (
            <div key={key} style={{ display: 'flex', gap: '8px', padding: '6px', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontWeight: 600, color: '#6a737d', minWidth: '140px', fontSize: '13px' }}>{key}:</span>
              <span style={{ fontSize: '13px', color: typeof val === 'string' && val.toUpperCase() === 'F' ? '#d73a49' : '#24292f', fontWeight: typeof val === 'string' && val.toUpperCase() === 'F' ? 700 : undefined }}>
                {val !== null && val !== undefined ? String(val) : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
