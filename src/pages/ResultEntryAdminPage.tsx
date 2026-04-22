import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { loadExamAnn25Meta } from '@/lib/examAnn25Meta'
import { buildResultEntryDraftKey, clearResultEntryDrafts, readResultEntryDrafts, upsertResultEntryDraft } from '@/lib/resultEntryDrafts'
import { TEACHER_RESULT_ENTRY_PATH, isAdminEmail } from '@/lib/userAccess'

interface SubjectComp { CQ?: string; MCQ?: string; Practical?: string; Total?: string; GPA?: string }
interface StudentRow { [key: string]: unknown }

function findColumn(row: StudentRow | undefined, patterns: RegExp[], fallback: string): string {
  if (!row) return fallback
  return Object.keys(row).find(key => patterns.some(pattern => pattern.test(key))) ?? fallback
}

function sortRowsByRoll(rows: StudentRow[]): StudentRow[] {
  const rollColumn = findColumn(rows[0], [/roll_2025/i, /roll/i], 'roll_2025')
  return [...rows].sort((left, right) => {
    const leftRoll = Number(left[rollColumn])
    const rightRoll = Number(right[rollColumn])
    const normalizedLeft = Number.isFinite(leftRoll) ? leftRoll : Number.MAX_SAFE_INTEGER
    const normalizedRight = Number.isFinite(rightRoll) ? rightRoll : Number.MAX_SAFE_INTEGER
    if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight
    return String(left[rollColumn] ?? '').localeCompare(String(right[rollColumn] ?? ''))
  })
}

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
  const [draftOwner, setDraftOwner] = useState('')
  const [showNames, setShowNames] = useState(false)
  const [showIid, setShowIid] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({})
  const [tableVersion, setTableVersion] = useState(0)
  const editRef = useRef<Record<string, Record<string, unknown>>>({})
  const [, setEditVersion] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      const owner = user.email ?? user.id ?? ''
      if (!isAdminEmail(owner)) {
        navigate(TEACHER_RESULT_ENTRY_PATH, { replace: true })
        return
      }
      setDraftOwner(owner)
      detectColumns()
    })
  }, [navigate])

  useEffect(() => {
    function syncViewport() {
      setIsMobile(window.innerWidth < 768)
    }
    syncViewport()
    window.addEventListener('resize', syncViewport)
    return () => window.removeEventListener('resize', syncViewport)
  }, [])

  const draftStorageKey = buildResultEntryDraftKey('admin', draftOwner, cls, section, subject)

  async function detectColumns() {
    const { data: sampleRows } = await supabase.from('exam_ann25').select('*').limit(1)
    if (sampleRows?.length) {
      const keys = Object.keys(sampleRows[0])
      const ic = keys.find(k => /^iid$/i.test(k)) ?? 'iid'
      setIidCol(ic)
      const smap = new Map<string, SubjectComp>()
      keys.forEach(k => {
        const m = k.match(/^\*?(.+?)_(CQ|MCQ|Practical|Total|GPA)$/i)
        if (!m) return
        const base = m[1].trim()
        const comp = m[2].toUpperCase() as keyof SubjectComp
        if (!smap.has(base)) smap.set(base, {})
        smap.get(base)![comp] = k
      })
      setSubjects(smap)
    }

    const meta = await loadExamAnn25Meta()
    setClasses(meta.classes)
    setSectionsByClass(meta.sectionsByClass)
  }

  const loadStudents = useCallback(async () => {
    if (!cls || !section || !subject) { setStatus('Select class, section and subject'); return }
    setLoading(true)
    setStatus('Loading…')
    const { data, error } = await supabase
      .from('exam_ann25')
      .select('*')
      .eq('class_2025', cls)
      .eq('section_2025', section)
      .order(iidCol, { ascending: true })

    if (error) {
      setStatus('Error: ' + error.message)
      setLoading(false)
      return
    }

    const restoredDrafts = readResultEntryDrafts(draftStorageKey)
    setStudents(sortRowsByRoll((data ?? []) as StudentRow[]))
    editRef.current = restoredDrafts
    setTableVersion(version => version + 1)
    const restoredCount = Object.keys(restoredDrafts).length
    setStatus(restoredCount > 0 ? `${data?.length ?? 0} students loaded, ${restoredCount} local draft${restoredCount === 1 ? '' : 's'} restored` : `${data?.length ?? 0} students loaded`)
    setLoading(false)
  }, [cls, section, subject, iidCol, draftStorageKey])

  useEffect(() => {
    if (section && subject) loadStudents()
  }, [section, subject, loadStudents])

  function getDraftAwareValue(row: StudentRow | undefined, key: string): unknown {
    if (!row) return undefined
    const iid = String(row[iidCol] ?? '')
    const edits = editRef.current[iid] ?? {}
    return Object.prototype.hasOwnProperty.call(edits, key) ? edits[key] : row[key]
  }

  function handleEdit(iid: string, col: string, value: string) {
    const parsedValue = value === '' ? null : Number(value)
    if (value !== '' && !Number.isFinite(parsedValue)) return

    if (!editRef.current[iid]) editRef.current[iid] = {}

    const row = students.find(student => String(student[iidCol] ?? '') === iid)
    if (normalizeMark(parsedValue) === normalizeMark(row?.[col])) {
      delete editRef.current[iid][col]
    } else {
      editRef.current[iid][col] = parsedValue
    }

    if (Object.keys(editRef.current[iid]).length === 0) {
      delete editRef.current[iid]
    }

    upsertResultEntryDraft(draftStorageKey, iid, (editRef.current[iid] ?? {}) as Record<string, number | null>)
    setEditVersion(version => version + 1)
  }

  async function saveAll() {
    const comps = subjects.get(subject)
    const updates = students.flatMap(row => {
      const iid = String(row[iidCol] ?? '')
      const edits = editRef.current[iid]
      if (!edits || Object.keys(edits).length === 0) return []

      const payload: Record<string, unknown> = { [iidCol]: row[iidCol] ?? iid, ...edits }
      if (comps?.Total) {
        const cq = comps.CQ ? normalizeMark(getDraftAwareValue(row, comps.CQ)) ?? 0 : 0
        const mcq = comps.MCQ ? normalizeMark(getDraftAwareValue(row, comps.MCQ)) ?? 0 : 0
        const practical = comps.Practical ? normalizeMark(getDraftAwareValue(row, comps.Practical)) ?? 0 : 0
        payload[comps.Total] = cq + mcq + practical || null
      }
      return [payload]
    })

    if (updates.length === 0) {
      setStatus('No changes to save')
      return
    }

    setStatus('Saving…')
    const { error } = await supabase.from('exam_ann25').upsert(updates, { onConflict: iidCol })
    if (error) {
      setStatus('Error: ' + error.message)
      return
    }

    editRef.current = {}
    clearResultEntryDrafts(draftStorageKey)
    setStatus(`Saved ${updates.length} records`)
    await loadStudents()
  }

  const comps = subjects.get(subject)
  const sections = cls ? sectionsByClass[cls] ?? [] : []
  const firstRow = students[0]
  const nameCol = findColumn(firstRow, [/student_name_en/i, /student_name|name/i], 'student_name_en')
  const rollCol = findColumn(firstRow, [/roll_2025/i, /roll/i], 'roll_2025')
  const fields = [
    comps?.CQ ? { key: comps.CQ, label: 'CQ' } : null,
    comps?.MCQ ? { key: comps.MCQ, label: 'MCQ' } : null,
    comps?.Practical ? { key: comps.Practical, label: 'Practical' } : null,
  ].filter((field): field is { key: string; label: string } => Boolean(field))
  const compactLabel = (label: string) => {
    if (!isMobile) return label
    if (label === 'Practical') return 'Pr'
    return label
  }
  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse' as const,
    background: '#fff',
    fontSize: isMobile ? '11px' : '13px',
    tableLayout: isMobile ? 'fixed' as const : 'auto' as const,
  }
  const headerPadding = isMobile ? '5px 2px' : '10px 8px'
  const cellPadding = isMobile ? '4px 2px' : '5px 8px'
  const compactCellPadding = isMobile ? '4px 3px' : '5px 8px'
  const inputPadding = isMobile ? '6px 1px' : '7px 4px'
  const rowFieldKeys = fields.map(field => field.key)

  function normalizeMark(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null
    const numericValue = Number(value)
    return Number.isFinite(numericValue) ? numericValue : null
  }

  function hasPreviousValue(row: StudentRow): boolean {
    return rowFieldKeys.some(key => row[key] !== null && row[key] !== undefined && row[key] !== '')
  }

  function isRowDirty(row: StudentRow): boolean {
    return rowFieldKeys.some(key => normalizeMark(getDraftAwareValue(row, key)) !== normalizeMark(row[key]))
  }

  function getFieldDisplayValue(row: StudentRow, key: string): string {
    const value = getDraftAwareValue(row, key)
    return value === null || value === undefined || value === '' ? '' : String(value)
  }

  function getTotalDisplayValue(row: StudentRow): string {
    if (!comps?.Total) return ''

    const cq = comps.CQ ? normalizeMark(getDraftAwareValue(row, comps.CQ)) : null
    const mcq = comps.MCQ ? normalizeMark(getDraftAwareValue(row, comps.MCQ)) : null
    const practical = comps.Practical ? normalizeMark(getDraftAwareValue(row, comps.Practical)) : null
    const hasAnyComponentValue = [cq, mcq, practical].some(value => value !== null)

    if (!hasAnyComponentValue) {
      const totalValue = row[comps.Total]
      return totalValue === null || totalValue === undefined || totalValue === '' ? '' : String(totalValue)
    }

    return String((cq ?? 0) + (mcq ?? 0) + (practical ?? 0))
  }

  async function saveRow(row: StudentRow) {
    if (!comps) return
    const iid = String(row[iidCol] ?? '')
    const edits = editRef.current[iid]
    if (!edits || Object.keys(edits).length === 0) {
      setStatus('No changes for this row')
      return
    }

    const payload: Record<string, unknown> = {}
    rowFieldKeys.forEach(key => {
      payload[key] = getDraftAwareValue(row, key) ?? null
    })

    if (comps.Total) {
      const cq = comps.CQ ? normalizeMark(getDraftAwareValue(row, comps.CQ)) ?? 0 : 0
      const mcq = comps.MCQ ? normalizeMark(getDraftAwareValue(row, comps.MCQ)) ?? 0 : 0
      const practical = comps.Practical ? normalizeMark(getDraftAwareValue(row, comps.Practical)) ?? 0 : 0
      payload[comps.Total] = cq + mcq + practical || null
    }

    setRowSaving(prev => ({ ...prev, [iid]: true }))
    const { error } = await supabase.from('exam_ann25').update(payload).eq(iidCol, iid)
    setRowSaving(prev => ({ ...prev, [iid]: false }))

    if (error) {
      setStatus('Error: ' + error.message)
      return
    }

    setStudents(prev => prev.map(current => (
      String(current[iidCol] ?? '') === iid ? { ...current, ...payload } : current
    )))
    delete editRef.current[iid]
    upsertResultEntryDraft(draftStorageKey, iid, {})
    setEditVersion(version => version + 1)
    setStatus(`Row ${iid} saved successfully`)
  }

  return (
    <div style={{ fontFamily: 'var(--font-family)', background: '#f6f8fa', minHeight: '100vh' }}>
      <div style={{ background: '#1a1a2e', color: '#fff', padding: isMobile ? '12px 14px' : '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Result Entry — Admin</h1>
        <a href="/dashboard" style={{ color: '#ccc', fontSize: '13px', textDecoration: 'none' }}>← Dashboard</a>
      </div>

      <div style={{ padding: isMobile ? '12px' : '16px', maxWidth: '1440px', margin: '0 auto' }}>
        <div style={{ background: '#fff', padding: isMobile ? '12px' : '14px 16px', borderRadius: '10px', border: '1px solid #d0d7de', marginBottom: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
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
              <select value={subject} onChange={e => setSubject(e.target.value)}>
                <option value="">Select Subject</option>
                {Array.from(subjects.keys()).sort().map(s => <option key={s} value={s}>{s.replace(/^\*+\s*/, '')}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={loadStudents} style={{ padding: '8px 14px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }} disabled={loading}>
              {loading ? 'Loading…' : '📊 Load Students'}
            </button>
            <button onClick={saveAll} style={{ padding: '8px 14px', background: '#1a7f37', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }} disabled={students.length === 0}>
              💾 Save All Changes
            </button>
            <button
              onClick={() => setShowIid(prev => !prev)}
              style={{ padding: '8px 14px', background: showIid ? '#dbeafe' : '#fff', color: '#0366d6', border: '1px solid #0366d6', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
            >
              {showIid ? '🙈 Hide IID' : '🆔 Show IID'}
            </button>
            <button
              onClick={() => setShowNames(prev => !prev)}
              style={{ padding: '8px 14px', background: showNames ? '#dbeafe' : '#fff', color: '#0366d6', border: '1px solid #0366d6', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
            >
              {showNames ? '🙈 Hide Name' : '👁 Show Name'}
            </button>
            <span style={{ marginLeft: isMobile ? '0' : 'auto', width: isMobile ? '100%' : 'auto', fontSize: '13px', color: status.startsWith('Error') ? '#d73a49' : '#6a737d' }}>{status}</span>
          </div>
        </div>

        {loading && <div className="spinner" />}

        {!loading && students.length > 0 && comps && (
          <div style={{ overflowX: isMobile ? 'hidden' : 'auto', border: '1px solid #d0d7de', borderRadius: '10px', background: '#fff' }}>
            <table key={tableVersion} style={tableStyle}>
              <thead>
                <tr style={{ background: '#1a1a2e', color: '#fff' }}>
                  {showIid && <th style={{ border: '1px solid #444', padding: headerPadding, textAlign: 'center', fontSize: isMobile ? '9px' : '13px', lineHeight: 1.1 }}>IID</th>}
                  {showNames && <th style={{ border: '1px solid #444', padding: headerPadding, fontSize: isMobile ? '9px' : '13px', lineHeight: 1.1 }}>Name</th>}
                  <th style={{ border: '1px solid #444', padding: headerPadding, textAlign: 'center', fontSize: isMobile ? '9px' : '13px', lineHeight: 1.1 }}>Roll</th>
                  {fields.map(field => <th key={field.key} style={{ border: '1px solid #444', padding: headerPadding, textAlign: 'center', fontSize: isMobile ? '9px' : '13px', lineHeight: 1.1 }}>{compactLabel(field.label)}</th>)}
                  {comps.Total && <th style={{ border: '1px solid #444', padding: headerPadding, textAlign: 'center', fontSize: isMobile ? '9px' : '13px', lineHeight: 1.1 }}>{isMobile ? 'Tot' : 'Total'}</th>}
                  {comps.GPA && <th style={{ border: '1px solid #444', padding: headerPadding, textAlign: 'center', fontSize: isMobile ? '9px' : '13px', lineHeight: 1.1 }}>GPA</th>}
                  <th style={{ border: '1px solid #444', padding: headerPadding, textAlign: 'center', fontSize: isMobile ? '9px' : '13px', lineHeight: 1.1 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((row, ri) => {
                  const iid = String(row[iidCol] ?? '')
                  const dirty = isRowDirty(row)
                  const saved = hasPreviousValue(row)
                  const buttonColor = dirty ? '#ff8a00' : saved ? '#1a7f37' : '#0366d6'
                  return (
                    <tr key={iid} style={{ background: ri % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      {showIid && <td style={{ border: '1px solid #e1e4e8', padding: cellPadding, textAlign: 'center', fontSize: isMobile ? '9px' : '13px', lineHeight: 1.05, overflowWrap: 'anywhere' }}>{iid}</td>}
                      {showNames && <td style={{ border: '1px solid #e1e4e8', padding: compactCellPadding, fontSize: isMobile ? '9px' : '13px', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(row[nameCol] ?? '')}</td>}
                      <td style={{ border: '1px solid #e1e4e8', padding: cellPadding, textAlign: 'center', whiteSpace: 'nowrap', fontSize: isMobile ? '10px' : '13px' }}>{String(row[rollCol] ?? '')}</td>
                      {fields.map(field => (
                        <td key={field.key} style={{ border: '1px solid #e1e4e8', padding: '2px' }}>
                          <input
                            type="number"
                            inputMode="numeric"
                            defaultValue={getFieldDisplayValue(row, field.key)}
                            onChange={e => handleEdit(iid, field.key, e.target.value)}
                            style={{ width: '100%', minWidth: 0, maxWidth: '100%', padding: inputPadding, border: '1px solid #ccc', borderRadius: '4px', textAlign: 'center', fontSize: isMobile ? '10px' : '12px', boxSizing: 'border-box' }}
                          />
                        </td>
                      ))}
                      {comps.Total && <td style={{ border: '1px solid #e1e4e8', padding: cellPadding, textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap', fontSize: isMobile ? '10px' : '13px' }}>{getTotalDisplayValue(row)}</td>}
                      {comps.GPA && <td style={{ border: '1px solid #e1e4e8', padding: cellPadding, textAlign: 'center', fontWeight: 600, color: row[comps.GPA] === 'F' ? '#d73a49' : '#0366d6', whiteSpace: 'nowrap', fontSize: isMobile ? '10px' : '13px' }}>{row[comps.GPA] !== null && row[comps.GPA] !== undefined ? String(row[comps.GPA]) : ''}</td>}
                      <td style={{ border: '1px solid #e1e4e8', padding: cellPadding, textAlign: 'center' }}>
                        <button
                          onClick={() => saveRow(row)}
                          disabled={rowSaving[iid]}
                          style={{
                            width: isMobile ? '100%' : '72px',
                            minWidth: isMobile ? '56px' : '72px',
                            padding: isMobile ? '7px 4px' : '8px 10px',
                            border: 'none',
                            borderRadius: '5px',
                            cursor: rowSaving[iid] ? 'not-allowed' : 'pointer',
                            background: buttonColor,
                            color: '#fff',
                            fontSize: isMobile ? '10px' : '12px',
                            fontWeight: 700,
                            opacity: rowSaving[iid] ? 0.7 : 1,
                          }}
                        >
                          {rowSaving[iid] ? 'Saving…' : 'Save'}
                        </button>
                      </td>
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
