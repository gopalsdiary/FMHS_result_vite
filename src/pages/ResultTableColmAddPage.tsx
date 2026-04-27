import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'

interface ColInfo { name: string; type: string }

export default function ResultTableColmAddPage() {
  const navigate = useNavigate()
  const [cols, setCols] = useState<ColInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [hasComponents, setHasComponents] = useState({ CQ: true, MCQ: true, Practical: false, Total: true, GPA: true })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      loadCols()
    })
  }, [navigate])

  async function loadCols() {
    setLoading(true)
    const { data, error } = await supabase.from('FMHS_exam_data').select('*').limit(1)
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    if (data?.length) {
      const keys = Object.keys(data[0])
      const c: ColInfo[] = keys.map(k => {
        const m = k.match(/^(.+?)_(CQ|MCQ|Practical|Total|GPA)$/i)
        return { name: k, type: m ? m[2].toUpperCase() : 'other' }
      })
      setCols(c)
    }
    setLoading(false)
  }

  async function addSubjectColumns() {
    if (!subjectName.trim()) { setStatus('Enter subject name'); return }
    const base = subjectName.trim()
    const toAdd: string[] = []
    if (hasComponents.CQ) toAdd.push(`${base}_CQ`)
    if (hasComponents.MCQ) toAdd.push(`${base}_MCQ`)
    if (hasComponents.Practical) toAdd.push(`${base}_Practical`)
    if (hasComponents.Total) toAdd.push(`${base}_Total`)
    if (hasComponents.GPA) toAdd.push(`${base}_GPA`)

    setStatus(`Note: Adding columns requires Supabase table ALTER permissions. Columns to add: ${toAdd.join(', ')}. Use the Supabase dashboard SQL editor to add these columns with type numeric (for marks) or text (for GPA).`)
  }

  const subjectGroups = new Map<string, string[]>()
  cols.forEach(c => {
    const m = c.name.match(/^(.+?)_(CQ|MCQ|Practical|Total|GPA)$/i)
    if (m) {
      const base = m[1]
      if (!subjectGroups.has(base)) subjectGroups.set(base, [])
      subjectGroups.get(base)!.push(m[2])
    }
  })

  return (
    <PageShell title="Result Table Column Manager">
      {() => (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 600, marginBottom: '8px' }}>Add Subject Columns to FMHS_exam_data</div>
            <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
              Subject columns follow the pattern: <code>SubjectName_CQ</code>, <code>SubjectName_MCQ</code>, <code>SubjectName_Total</code>, <code>SubjectName_GPA</code>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label>Subject Name</label>
                <input type="text" value={subjectName} onChange={e => setSubjectName(e.target.value)} placeholder="e.g. Science" style={{ minWidth: '200px' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {(['CQ','MCQ','Practical','Total','GPA'] as const).map(c => (
                  <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                    <input type="checkbox" checked={hasComponents[c]} onChange={e => setHasComponents(p => ({ ...p, [c]: e.target.checked }))} /> {c}
                  </label>
                ))}
              </div>
              <button className="btn btn-success" onClick={addSubjectColumns}>+ Generate SQL</button>
            </div>
            {status && (
              <div className="alert alert-info" style={{ marginTop: '10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {status}
              </div>
            )}
          </div>

          {loading && <div className="spinner" />}

          {!loading && (
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: '12px' }}>Current Subject Columns in FMHS_exam_data</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                {Array.from(subjectGroups.entries()).map(([subj, comps]) => (
                  <div key={subj} style={{ padding: '10px 14px', border: '1px solid #d0d7de', borderRadius: '6px', background: '#f6f8fa' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#0366d6' }}>{subj}</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {comps.map(c => (
                        <span key={c} style={{ fontSize: '11px', padding: '2px 7px', background: '#dbeafe', color: '#1e40af', borderRadius: '12px', fontWeight: 500 }}>{c}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {subjectGroups.size === 0 && (
                <p style={{ color: '#666', fontSize: '13px' }}>No subject columns detected (columns must match pattern SubjectName_CQ/MCQ/etc)</p>
              )}
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}

