import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'

interface SubjectComp { CQ?: string; MCQ?: string; Practical?: string; Total?: string; GPA?: string }
interface StudentRow { [key: string]: unknown }

function pickKey(keys: string[], candidates: (string | RegExp)[]): string | null {
  for (const c of candidates) {
    const found = typeof c === 'string' ? keys.find(k => k.toLowerCase() === c.toLowerCase()) : keys.find(k => c.test(k))
    if (found) return found
  }
  return null
}

function calcGPA(total: number): string | number {
  if (total >= 80) return 5.00
  if (total >= 70) return 4.00
  if (total >= 60) return 3.50
  if (total >= 50) return 3.00
  if (total >= 40) return 2.00
  if (total >= 33) return 1.00
  return 'F'
}

export default function GradeEntrySystemPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<StudentRow[]>([])
  const [_columns, setColumns] = useState<string[]>([])
  const [subjectMap, setSubjectMap] = useState<Record<string, SubjectComp>>({})
  const [fixedCols, setFixedCols] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [showTotal, setShowTotal] = useState(true)
  const [showGPA, setShowGPA] = useState(true)
  const editRef = useRef<Record<string, Record<string, unknown>>>({})

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      loadData()
    })
  }, [navigate])

  const loadData = useCallback(async () => {
    setLoading(true); setStatus('Loading…')
    const { data: rows, error } = await supabase.from('fmhs_exam_data').select('*').order('class', { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    const list = (rows ?? []) as StudentRow[]
    setData(list)
    if (list.length > 0) {
      const keys = Object.keys(list[0])
      const iidCol = pickKey(keys, ['iid', 'IID', /^iid$/i]) ?? 'iid'
      const nameCol = pickKey(keys, ['student_name', 'name', /name/i]) ?? 'name'
      const rollCol = pickKey(keys, ['roll', /roll/i]) ?? 'roll'
      const classCol = pickKey(keys, ['class_2025', 'class', /class/i]) ?? 'class'
      const sectionCol = pickKey(keys, ['section_2025', 'section', /section/i]) ?? 'section'
      const fixed = [iidCol, nameCol, rollCol, classCol, sectionCol].filter(k => keys.includes(k))
      setFixedCols(fixed)

      const smap: Record<string, SubjectComp> = {}
      keys.forEach(k => {
        const m = k.match(/^(\*?.+?)_(CQ|MCQ|Practical|Total|GPA)$/i)
        if (m) {
          const base = m[1].trim()
          const comp = m[2] as keyof SubjectComp
          smap[base] = smap[base] ?? {}
          smap[base][comp] = k
        }
      })
      setSubjectMap(smap)
      setColumns(keys)
    }
    setStatus(`${list.length} students loaded`)
    setLoading(false)
  }, [])

  function getCellKey(row: StudentRow, iidCol: string): string { return String(row[iidCol] ?? '') }

  function handleEdit(iid: string, col: string, value: string) {
    if (!editRef.current[iid]) editRef.current[iid] = {}
    editRef.current[iid][col] = value === '' ? null : Number(value) || value
  }

  async function saveRow(iid: string, _iidCol: string) {
    const edits = editRef.current[iid]
    if (!edits || Object.keys(edits).length === 0) return
    const { error } = await supabase.from('fmhs_exam_data').update(edits).eq('id', iid)
    setStatus(error ? `Error saving ${iid}: ${error.message}` : `Saved ${iid}`)
  }

  function calculateAllTotals() {
    const iidCol = fixedCols[0] ?? 'iid'
    const updated = data.map(row => {
      const newRow = { ...row }
      Object.entries(subjectMap).forEach(([, comps]) => {
        if (comps.Total) {
          const cq = Number(row[comps.CQ!]) || 0
          const mcq = Number(row[comps.MCQ!]) || 0
          const practical = Number(row[comps.Practical!]) || 0
          const total = cq + mcq + practical
          if (total > 0) {
            newRow[comps.Total] = total
            if (!editRef.current[String(row[iidCol])]) editRef.current[String(row[iidCol])] = {}
            editRef.current[String(row[iidCol])][comps.Total] = total
          }
        }
      })
      return newRow
    })
    setData(updated)
    setStatus('Totals calculated — click "Update DB" to save')
  }

  function calculateAllGPA() {
    const iidCol = fixedCols[0] ?? 'iid'
    const updated = data.map(row => {
      const newRow = { ...row }
      Object.entries(subjectMap).forEach(([, comps]) => {
        if (comps.GPA && comps.Total) {
          const total = Number(row[comps.Total]) || 0
          if (total > 0) {
            const gpa = calcGPA(total)
            newRow[comps.GPA] = gpa
            if (!editRef.current[String(row[iidCol])]) editRef.current[String(row[iidCol])] = {}
            editRef.current[String(row[iidCol])][comps.GPA] = gpa
          }
        }
      })
      return newRow
    })
    setData(updated)
    setStatus('GPA calculated — click "Update DB" to save')
  }

  async function updateAllToDB() {
    setStatus('Updating database…')
    const iidCol = fixedCols[0] ?? 'iid'
    let done = 0
    for (const row of data) {
      const iid = String(row[iidCol] ?? '')
      if (editRef.current[iid]) {
        const { error } = await supabase.from('fmhs_exam_data').update(editRef.current[iid]).eq('id', iid)
        if (!error) { done++; delete editRef.current[iid] }
      }
    }
    setStatus(`Updated ${done} records`)
  }

  const iidCol = fixedCols[0] ?? 'iid'
  const subjectBases = Object.keys(subjectMap)

  // Columns to show in table header
  const visibleSubjectCols = (base: string) => {
    const c = subjectMap[base]
    const cols: string[] = []
    if (c.CQ) cols.push(c.CQ)
    if (c.MCQ) cols.push(c.MCQ)
    if (c.Practical) cols.push(c.Practical)
    if (showTotal && c.Total) cols.push(c.Total)
    if (showGPA && c.GPA) cols.push(c.GPA)
    return cols
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '48px' }}><div className="spinner" /></div>

  return (
    <div style={{ fontFamily: 'var(--font-family)', background: '#f6f8fa', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0366d6, #024c9e)', color: '#fff', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Grade Entry System — Annual 2025</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
            ← Dashboard
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ background: '#fff', padding: '12px 16px', borderBottom: '1px solid #d0d7de', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={loadData}>📊 Refresh</button>
        <button className="btn btn-info" style={{ background: '#3b82f6', borderColor: '#3b82f6', color: '#fff' }} onClick={calculateAllTotals}>➕ Calculate Totals</button>
        <button className="btn btn-success" onClick={calculateAllGPA}>🔄 Calculate GPA</button>
        <button className="btn btn-secondary" onClick={updateAllToDB}>💾 Update DB</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showTotal} onChange={e => setShowTotal(e.target.checked)} /> Total
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showGPA} onChange={e => setShowGPA(e.target.checked)} /> GPA
        </label>
        <span style={{ marginLeft: 'auto', color: '#6a737d', fontSize: '13px' }}>{status}</span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', padding: '12px' }}>
        <table style={{ fontSize: '11px', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            {/* Row 1: subject group headers */}
            <tr>
              {fixedCols.map(col => <th key={col} rowSpan={2} style={{ border: '1px solid #d0d7de', padding: '6px 4px', background: '#f0f3f6', fontSize: '11px', textAlign: 'center' }}>{col}</th>)}
              {subjectBases.map(base => {
                const visCols = visibleSubjectCols(base)
                return visCols.length > 0 ? (
                  <th key={base} colSpan={visCols.length} style={{ border: '1px solid #d0d7de', padding: '4px', background: '#dfe6ed', fontSize: '10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {base.replace(/^\*+\s*/, '')}
                  </th>
                ) : null
              })}
              <th rowSpan={2} style={{ border: '1px solid #d0d7de', padding: '6px 4px', background: '#f0f3f6', fontSize: '11px' }}>Action</th>
            </tr>
            {/* Row 2: component sub-headers */}
            <tr>
              {subjectBases.map(base =>
                visibleSubjectCols(base).map(col => (
                  <th key={col} style={{ border: '1px solid #d0d7de', padding: '4px 2px', background: '#f8f9fa', fontSize: '10px', textAlign: 'center', whiteSpace: 'nowrap', writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: '80px', verticalAlign: 'bottom' }}>
                    {col.split('_').pop()}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => {
              const iid = getCellKey(row, iidCol)
              return (
                <tr key={iid || ri} style={{ background: ri % 2 === 0 ? '#fff' : '#fcfcfd' }}>
                  {fixedCols.map(col => (
                    <td key={col} style={{ border: '1px solid #e1e4e8', padding: '3px 6px', whiteSpace: 'nowrap', fontSize: '11px' }}>
                      {String(row[col] ?? '')}
                    </td>
                  ))}
                  {subjectBases.map(base =>
                    visibleSubjectCols(base).map(col => {
                      const isGPA = col.toUpperCase().endsWith('_GPA')
                      const isTotal = col.toUpperCase().endsWith('_TOTAL')
                      const val = row[col]
                      const isFail = typeof val === 'string' && val.toUpperCase() === 'F'
                      if (isTotal || isGPA) {
                        return (
                          <td key={col} style={{ border: '1px solid #e1e4e8', textAlign: 'center', padding: '2px', fontWeight: 600, color: isFail ? '#d73a49' : isGPA ? '#0366d6' : undefined, background: isTotal ? '#f0f9ff' : undefined }}>
                            {val !== null && val !== undefined ? String(val) : ''}
                          </td>
                        )
                      }
                      return (
                        <td key={col} style={{ border: '1px solid #e1e4e8', padding: '1px', textAlign: 'center' }}>
                          <input
                            type="number"
                            defaultValue={val !== null && val !== undefined ? String(val) : ''}
                            onChange={e => { handleEdit(iid, col, e.target.value); const newData = [...data]; (newData[ri] as StudentRow)[col] = e.target.value === '' ? null : Number(e.target.value); setData(newData) }}
                            style={{ width: '48px', padding: '2px 4px', border: '1px solid #d0d7de', borderRadius: '3px', textAlign: 'center', fontSize: '11px' }}
                          />
                        </td>
                      )
                    })
                  )}
                  <td style={{ border: '1px solid #e1e4e8', textAlign: 'center', padding: '2px' }}>
                    <button onClick={() => saveRow(iid, iidCol)} style={{ fontSize: '10px', padding: '3px 7px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                      Save
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

