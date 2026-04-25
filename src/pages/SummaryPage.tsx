import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'

const SECTIONS = ['6A','6B','6C','7A','7B','7C','8A','8B','8C','9A','9B','10A','10B']

interface SectionStats {
  section: string; total: number; pass: number; fail: number; absent: number
  gpaA: number; gpa4: number; gpa35: number; gpa3: number; gpa2: number; gpa1: number
  avgGpa: number; avgTotal: number
}

interface Student {
  iid: string; section?: string; gpa_final?: string; remark?: string; total_mark?: number
}

export default function SummaryPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [stats, setStats] = useState<SectionStats[]>([])
  const [filterSection, setFilterSection] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      loadAll()
    })
  }, [navigate])

  async function loadAll() {
    setLoading(true); setStatus('Loading…')
    const { data, error } = await supabase.from('fmhs_exam_data').select('iid, section, gpa_final, remark, total_mark')
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    const rows = (data ?? []) as Student[]
    const grouped = new Map<string, Student[]>()
    rows.forEach(r => {
      const sec = r.section ?? 'Unknown'
      if (!grouped.has(sec)) grouped.set(sec, [])
      grouped.get(sec)!.push(r)
    })
    const result: SectionStats[] = []
    grouped.forEach((students, section) => {
      const total = students.length
      const pass = students.filter(s => s.remark && /pass|passed|উত্তীর্ণ/i.test(s.remark)).length
      const fail = students.filter(s => {
        const g = String(s.gpa_final ?? '').trim()
        return g === 'F' || g === '0'
      }).length
      const absent = students.filter(s => s.remark && /absent/i.test(s.remark)).length
      const gpas = students.map(s => parseFloat(String(s.gpa_final ?? '0'))).filter(g => !isNaN(g) && g > 0)
      const avgGpa = gpas.length ? Math.round((gpas.reduce((a,b)=>a+b,0)/gpas.length)*100)/100 : 0
      const totals = students.map(s => Number(s.total_mark ?? 0)).filter(t => t > 0)
      const avgTotal = totals.length ? Math.round(totals.reduce((a,b)=>a+b,0)/totals.length) : 0
      result.push({
        section, total, pass, fail, absent,
        gpaA: gpas.filter(g=>g>=5).length,
        gpa4: gpas.filter(g=>g>=4&&g<5).length,
        gpa35: gpas.filter(g=>g>=3.5&&g<4).length,
        gpa3: gpas.filter(g=>g>=3&&g<3.5).length,
        gpa2: gpas.filter(g=>g>=2&&g<3).length,
        gpa1: gpas.filter(g=>g>=1&&g<2).length,
        avgGpa, avgTotal
      })
    })
    result.sort((a,b) => a.section.localeCompare(b.section))
    setStats(result)
    setStatus(`Summary for ${result.length} sections (${rows.length} students total)`)
    setLoading(false)
  }

  const displayStats = filterSection ? stats.filter(s => s.section === filterSection) : stats
  const overallTotal = stats.reduce((a,b)=>a+b.total,0)
  const overallPass = stats.reduce((a,b)=>a+b.pass,0)
  const overallFail = stats.reduce((a,b)=>a+b.fail,0)

  return (
    <PageShell title="Result Summary">
      {() => (
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          {/* Overall stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Total Students', value: overallTotal, color: '#0366d6' },
              { label: 'Passed', value: overallPass, color: '#1a7f37' },
              { label: 'Failed', value: overallFail, color: '#d73a49' },
              { label: 'Pass Rate', value: overallTotal ? `${Math.round(overallPass/overallTotal*100)}%` : '—', color: '#6f42c1' },
            ].map(card => (
              <div key={card.label} style={{ background: '#fff', border: `2px solid ${card.color}`, borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: '12px', color: '#6a737d', marginTop: '4px' }}>{card.label}</div>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <label>Filter by Section: </label>
                <select value={filterSection} onChange={e => setFilterSection(e.target.value)} style={{ marginLeft: '8px' }}>
                  <option value="">All Sections</option>
                  {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button className="btn btn-secondary" onClick={loadAll}>🔄 Refresh</button>
              <button className="btn btn-primary" onClick={() => window.print()}>🖨 Print</button>
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '8px' }}>{status}</div>}
          </div>

          {loading && <div className="spinner" />}

          {!loading && displayStats.length > 0 && (
            <div className="card table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Total</th>
                    <th>Pass</th>
                    <th>Fail</th>
                    <th>Absent</th>
                    <th>Pass%</th>
                    <th title="GPA 5.00 (A+)">A+</th>
                    <th title="GPA 4.00">A</th>
                    <th title="GPA 3.50">A-</th>
                    <th title="GPA 3.00">B</th>
                    <th title="GPA 2.00">C</th>
                    <th title="GPA 1.00">D</th>
                    <th>Avg GPA</th>
                    <th>Avg Total</th>
                  </tr>
                </thead>
                <tbody>
                  {displayStats.map(s => (
                    <tr key={s.section}>
                      <td style={{ fontWeight: 600 }}>{s.section}</td>
                      <td style={{ textAlign: 'center' }}>{s.total}</td>
                      <td style={{ textAlign: 'center', color: '#1a7f37', fontWeight: 600 }}>{s.pass}</td>
                      <td style={{ textAlign: 'center', color: '#d73a49', fontWeight: 600 }}>{s.fail}</td>
                      <td style={{ textAlign: 'center', color: '#6a737d' }}>{s.absent}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: '#6f42c1' }}>
                        {s.total > 0 ? `${Math.round(s.pass/s.total*100)}%` : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>{s.gpaA}</td>
                      <td style={{ textAlign: 'center' }}>{s.gpa4}</td>
                      <td style={{ textAlign: 'center' }}>{s.gpa35}</td>
                      <td style={{ textAlign: 'center' }}>{s.gpa3}</td>
                      <td style={{ textAlign: 'center' }}>{s.gpa2}</td>
                      <td style={{ textAlign: 'center' }}>{s.gpa1}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: '#0366d6' }}>{s.avgGpa}</td>
                      <td style={{ textAlign: 'center' }}>{s.avgTotal}</td>
                    </tr>
                  ))}
                </tbody>
                {displayStats.length > 1 && (
                  <tfoot>
                    <tr style={{ background: '#f0f3f6', fontWeight: 700 }}>
                      <td>Total</td>
                      <td style={{ textAlign: 'center' }}>{displayStats.reduce((a,b)=>a+b.total,0)}</td>
                      <td style={{ textAlign: 'center', color: '#1a7f37' }}>{displayStats.reduce((a,b)=>a+b.pass,0)}</td>
                      <td style={{ textAlign: 'center', color: '#d73a49' }}>{displayStats.reduce((a,b)=>a+b.fail,0)}</td>
                      <td style={{ textAlign: 'center' }}>{displayStats.reduce((a,b)=>a+b.absent,0)}</td>
                      <td style={{ textAlign: 'center' }}>—</td>
                      <td style={{ textAlign: 'center' }}>{displayStats.reduce((a,b)=>a+b.gpaA,0)}</td>
                      <td style={{ textAlign: 'center' }}>{displayStats.reduce((a,b)=>a+b.gpa4,0)}</td>
                      <td style={{ textAlign: 'center' }}>{displayStats.reduce((a,b)=>a+b.gpa35,0)}</td>
                      <td style={{ textAlign: 'center' }}>{displayStats.reduce((a,b)=>a+b.gpa3,0)}</td>
                      <td style={{ textAlign: 'center' }}>{displayStats.reduce((a,b)=>a+b.gpa2,0)}</td>
                      <td style={{ textAlign: 'center' }}>{displayStats.reduce((a,b)=>a+b.gpa1,0)}</td>
                      <td style={{ textAlign: 'center' }}>—</td>
                      <td style={{ textAlign: 'center' }}>—</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}

