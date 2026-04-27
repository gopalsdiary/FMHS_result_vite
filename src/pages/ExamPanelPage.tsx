import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import { processExamResults } from '@/services/resultProcessor'



interface Exam {
  id: number
  exam_name: string
  year: number
  is_live: boolean
  teacher_entry_enabled: boolean
  class_6: number
  class_7: number
  class_8: number
  class_9: number
  class_10: number
  class_11: number
  class_12: number
}

interface SubjectComp { CQ?: string; MCQ?: string; Practical?: string; Total?: string; GPA?: string }
interface SubjectRule {
  id: number
  subject_id?: number
  subject_name: string
  subject_code: string
  pass_cq: number
  pass_mcq: number
  pass_practical: number
  pass_total: number
  full_marks: number
  total_cq: number
  total_mcq: number
  total_practical: number
}

interface StudentRow { [key: string]: unknown }



export default function ExamPanelPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState<Exam | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'setup' | 'marks' | 'reports' | 'optional'>('overview')
  const [isEditingCounts, setIsEditingCounts] = useState(false)
  const [draftCounts, setDraftCounts] = useState<Record<number, number>>({})
  
  const [showDetails, setShowDetails] = useState(false)
  const [data, setData] = useState<StudentRow[]>([])
  const [subjectMap, setSubjectMap] = useState<Record<string, SubjectComp>>({})
  const [fixedCols] = useState<string[]>(['roll'])
  const editChanges = useRef<Record<string, any>>({})

  // Filters / Import state
  const [gridClass, setGridClass] = useState('')
  const [gridSection, setGridSection] = useState('')
  const [availableClasses, setAvailableClasses] = useState<string[]>([])
  const [availableSections, setAvailableSections] = useState<string[]>([])
  const [filterSubject, setFilterSubject] = useState('')
  const [sourceYear, setSourceYear] = useState<string>('')
  const [availableYears, setAvailableYears] = useState<string[]>([])
  const [sourceClasses, setSourceClasses] = useState<string[]>([])
  const [sourceSectionsByClass, setSourceSectionsByClass] = useState<Record<string, string[]>>({})
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [subjectRules, setSubjectRules] = useState<SubjectRule[]>([])
  const [editingRule, setEditingRule] = useState<SubjectRule | null>(null)
  
  // Report Summary state
  const [summaryData, setSummaryData] = useState({
    passCount: 0,
    failCount: 0,
    topStudents: [] as StudentRow[]
  })

  useEffect(() => {
    if (sourceYear) {
      loadSourceMetadata()
    } else {
      setSourceClasses([])
      setSourceSectionsByClass({})
    }
  }, [sourceYear])

  async function loadSourceMetadata() {
    if (!sourceYear) return
    const classCol = `class_${sourceYear}`
    const sectionCol = `section_${sourceYear}`
    
    setStatus(`🔍 Scanning database for Class/Section metadata (${sourceYear})...`)
    
    let allStudents: any[] = []
    let from = 0
    let to = 999
    let hasMore = true

    while (hasMore) {
      const { data, error } = await supabase
        .from('student_database')
        .select(`${classCol}, ${sectionCol}`)
        .not(classCol, 'is', null)
        .range(from, to)
      
      if (error) { 
        setStatus('Error loading metadata: ' + error.message)
        hasMore = false
        return 
      }
      
      if (data && data.length > 0) {
        allStudents = [...allStudents, ...data]
        if (data.length < 1000) {
          hasMore = false
        } else {
          from += 1000
          to += 1000
        }
      } else {
        hasMore = false
      }
    }

    const classes = new Set<string>()
    const classToSections: Record<string, Set<string>> = {}

    allStudents.forEach(s => {
      const c = String(s[classCol] ?? '').trim()
      const sec = String(s[sectionCol] ?? '').trim()
      if (c && c !== 'null') {
        classes.add(c)
        if (!classToSections[c]) classToSections[c] = new Set()
        if (sec && sec !== 'null') classToSections[c].add(sec)
      }
    })

    const sortedClasses = Array.from(classes).sort((a,b) => {
      const na = parseInt(a), nb = parseInt(b)
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      return a.localeCompare(b)
    })

    setSourceClasses(sortedClasses)
    const finalSections: Record<string, string[]> = {}
    Object.keys(classToSections).forEach(c => {
      finalSections[c] = Array.from(classToSections[c]).sort()
    })
    setSourceSectionsByClass(finalSections)
    setStatus(`✅ Metadata loaded. Found ${sortedClasses.length} classes.`)
  }

  const [totalEnrolled, setTotalEnrolled] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    loadExamData()
    loadMetadata()
    loadReportSummary()
    loadTotalEnrollment()
    // Set a stable range of years
    setAvailableYears(['2024', '2025', '2026', '2027', '2028', '2029', '2030'])
  }, [id])

  async function loadTotalEnrollment() {
    const { count, error } = await supabase.from('FMHS_exam_data').select('*', { count: 'exact', head: true }).eq('exam_id', id)
    if (!error) setTotalEnrolled(count)
  }

  async function loadReportSummary() {
    let rows: any[] = []
    let from = 0
    let to = 999
    let hasMore = true
    while (hasMore) {
      const { data, error } = await supabase.from('FMHS_exam_data').select('*').eq('exam_id', id).range(from, to)
      if (error) break
      if (data && data.length > 0) {
        rows = [...rows, ...data]
        if (data.length < 1000) hasMore = false
        else { from += 1000; to += 1000 }
      } else { hasMore = false }
    }

    if (rows.length > 0) {
      const pass = rows.filter(r => r.status === 'Pass' || r.gpa_final !== 'F' && Number(r.gpa_final) > 0).length
      const fail = rows.filter(r => r.status === 'Fail' || r.gpa_final === 'F').length
      const top = [...rows].sort((a,b) => (Number(b.total_mark)||0) - (Number(a.total_mark)||0)).slice(0, 3)
      setSummaryData({ passCount: pass, failCount: fail, topStudents: top })
    }
  }

  useEffect(() => {
    if (gridClass && sourceYear) {
      updatePreviewCount()
    }
  }, [gridClass, gridSection, sourceYear])

  async function updatePreviewCount() {
    if (!gridClass || !sourceYear) { setPreviewCount(null); return }
    const classCol = `class_${sourceYear}`
    const sectionCol = `section_${sourceYear}`
    
    // 1. Get all candidate students from database (non-TC)
    let students: any[] = []
    let from = 0
    let to = 999
    let hasMore = true
    while (hasMore) {
      let q = supabase.from('student_database').select('iid').eq(classCol, gridClass).or('status.is.null,status.neq.TC')
      if (gridSection && gridSection !== 'All') q = q.eq(sectionCol, gridSection)
      const { data, error } = await q.range(from, to)
      if (error) break
      if (data && data.length > 0) {
        students = [...students, ...data]
        if (data.length < 1000) hasMore = false
        else { from += 1000; to += 1000 }
      } else { hasMore = false }
    }
    if (students.length === 0) { setPreviewCount(0); return }

    // 2. Get students already in this specific exam
    let existing: any[] = []
    from = 0; to = 999; hasMore = true
    while (hasMore) {
      const { data, error } = await supabase.from('FMHS_exam_data').select('iid').eq('exam_id', id).range(from, to)
      if (error) break
      if (data && data.length > 0) {
        existing = [...existing, ...data]
        if (data.length < 1000) hasMore = false
        else { from += 1000; to += 1000 }
      } else { hasMore = false }
    }
    
    const existingIds = new Set(existing.map(e => String(e.iid)))
    const netCount = students.filter(s => !existingIds.has(String(s.iid))).length
    
    setPreviewCount(netCount)
  }

  useEffect(() => {
    const map: Record<string, SubjectComp> = {}
    subjectRules.forEach(r => {
      const base = `*${r.subject_name}`
      map[r.subject_name] = {
        CQ: r.total_cq > 0 ? `${base}_CQ` : undefined,
        MCQ: r.total_mcq > 0 ? `${base}_MCQ` : undefined,
        Practical: r.total_practical > 0 ? `${base}_Practical` : undefined,
        Total: `${base}_Total`,
        GPA: `${base}_GPA`
      }
    })
    setSubjectMap(map)
  }, [subjectRules])

  async function loadExamData() {
    const { data: ex } = await supabase.from('FMHS_exams_names').select('*').eq('id', id).single()
    if (ex) {
      setExam(ex)
      const counts: Record<number, number> = {}
      for (let i = 6; i <= 12; i++) counts[i] = (ex as any)[`class_${i}`] || 0
      setDraftCounts(counts)
    }
    
    const { data: rules } = await supabase.from('FMHS_exam_subjects').select('*').eq('exam_id', id)
    setSubjectRules(rules || [])
    setLoading(false)
  }

  async function loadMetadata() {
    let rows: any[] = []
    let from = 0; let to = 999; let hasMore = true
    while (hasMore) {
      const { data, error } = await supabase.from('FMHS_exam_data').select('class, section').eq('exam_id', Number(id)).range(from, to)
      if (error) break
      if (data && data.length > 0) {
        rows = [...rows, ...data]
        if (data.length < 1000) hasMore = false
        else { from += 1000; to += 1000 }
      } else { hasMore = false }
    }

    if (rows.length > 0) {
      setAvailableClasses(Array.from(new Set(rows.map(r => String(r.class)))).sort((a,b) => Number(a)-Number(b)))
      setAvailableSections(Array.from(new Set(rows.map(r => String(r.section)))).sort())
    }
  }

  async function loadMarks() {
    await loadMarksExplicitly(gridClass, gridSection, filterSubject)
  }

  async function loadMarksExplicitly(cVal: string, sVal: string, subVal: string) {
    if (!cVal) return
    setLoading(true)
    
    // RESET STATES TO PREVENT DATA LEAKAGE
    editChanges.current = {}
    setSavingRows({})

    let rows: any[] = []
    let from = 0; let to = 999; let hasMore = true
    while (hasMore) {
      let q = supabase.from('FMHS_exam_data').select('*').eq('exam_id', Number(id)).eq('class', Number(cVal))
      if (sVal && sVal !== 'All') q = q.eq('section', sVal)
      const { data, error } = await q.order('roll', { ascending: true }).range(from, to)
      if (error) break
      if (data && data.length > 0) {
        rows = [...rows, ...data]
        if (data.length < 1000) hasMore = false
        else { from += 1000; to += 1000 }
      } else { hasMore = false }
    }

    // RESTORE FROM LOCAL STORAGE
    const localKey = `admin_unsaved_${id}_${cVal}_${sVal}_${subVal}`
    const localData = localStorage.getItem(localKey)
    if (localData) {
      try {
        const parsed = JSON.parse(localData)
        editChanges.current = parsed
        
        // MERGE INTO ROWS FOR UI
        rows.forEach(r => {
          if (parsed[r.id]) {
            Object.assign(r, parsed[r.id])
            const subject = subjectMap[subVal]
            const totalCol = subject?.Total
            const componentCols = [subject?.CQ, subject?.MCQ, subject?.Practical].filter(Boolean) as string[]
            const hasComponentDraft = componentCols.some(col => Object.prototype.hasOwnProperty.call(parsed[r.id], col))
            if (totalCol && hasComponentDraft) {
              const totalValue = calculateDraftTotal(String(r.id), r as StudentRow, subVal)
              r[totalCol] = totalValue
            }
          }
        })

        setSavingRows(Object.keys(parsed).reduce((acc, rid) => ({ ...acc, [rid]: 'pending' }), {}))
      } catch (e) { console.error('Local restore error', e) }
    }

    if (rows.length > 0) {
      setData(rows)
    } else {
      setData([])
    }
    setLoading(false)
  }

  const [savingRows, setSavingRows] = useState<Record<string, 'pending' | 'saving' | 'success'>>({})

  function getRowById(rowId: string) {
    return data.find(row => String(row.id) === rowId)
  }

  function calculateDraftTotal(rowId: string, row: StudentRow, subjectKey: string) {
    const subject = subjectKey ? subjectMap[subjectKey] : undefined
    const totalCol = subject?.Total
    if (!totalCol) return null

    const componentCols = [subject.CQ, subject.MCQ, subject.Practical].filter(Boolean) as string[]
    if (componentCols.length === 0) return null

    const draft = editChanges.current[rowId] ?? {}
    const hasComponentDraft = componentCols.some(col => Object.prototype.hasOwnProperty.call(draft, col))
    if (!hasComponentDraft) return null

    let sum = 0
    let hasValue = false
    componentCols.forEach(col => {
      const raw = Object.prototype.hasOwnProperty.call(draft, col) ? draft[col] : row[col]
      if (raw !== null && raw !== undefined && raw !== '') {
        const numeric = Number(raw)
        if (Number.isFinite(numeric)) {
          sum += numeric
          hasValue = true
        }
      }
    })

    return hasValue ? sum : null
  }

  function syncDraftTotal(rowId: string, row: StudentRow, subjectKey: string) {
    const subject = subjectKey ? subjectMap[subjectKey] : undefined
    const totalCol = subject?.Total
    if (!totalCol) return null

    const totalValue = calculateDraftTotal(rowId, row, subjectKey)
    if (!editChanges.current[rowId]) editChanges.current[rowId] = {}

    if (totalValue === null) delete editChanges.current[rowId][totalCol]
    else editChanges.current[rowId][totalCol] = totalValue

    if (Object.keys(editChanges.current[rowId]).length === 0) {
      delete editChanges.current[rowId]
    }

    return totalValue
  }

  function handleEdit(rowId: string, col: string, value: string) {
    const row = getRowById(rowId)
    if (!row) return

    const parsedValue = value === '' ? null : Number(value)
    if (value !== '' && !Number.isFinite(parsedValue)) return

    if (!editChanges.current[rowId]) editChanges.current[rowId] = {}

    if (parsedValue === row[col] || (parsedValue === null && (row[col] === null || row[col] === undefined || row[col] === ''))) {
      delete editChanges.current[rowId][col]
    } else {
      editChanges.current[rowId][col] = parsedValue
    }

    const totalValue = syncDraftTotal(rowId, row, filterSubject)
    
    const totalCol = filterSubject ? subjectMap[filterSubject]?.Total : undefined
    const nextRow: StudentRow = { ...row, [col]: parsedValue }
    if (totalCol && totalValue !== null) {
      nextRow[totalCol] = totalValue
    }

    setData(prev => prev.map(r => String(r.id) === rowId ? nextRow : r))

    // Set status to pending (orange)
    setSavingRows(prev => ({ ...prev, [rowId]: 'pending' }))

    // SAVE TO LOCAL STORAGE
    const localKey = `admin_unsaved_${id}_${gridClass}_${gridSection}_${filterSubject}`
    localStorage.setItem(localKey, JSON.stringify(editChanges.current))
  }

  async function saveRow(rowId: string) {
    const row = getRowById(rowId)
    if (!row) return
    syncDraftTotal(rowId, row, filterSubject)
    if (!editChanges.current[rowId]) return
    setSavingRows(prev => ({ ...prev, [rowId]: 'saving' }))
    
    const { error } = await supabase.from('FMHS_exam_data').update(editChanges.current[rowId]).eq('id', rowId)
    
    if (!error) {
      setSavingRows(prev => ({ ...prev, [rowId]: 'success' }))
      
      // CLEAR FROM LOCAL STORAGE
      delete editChanges.current[rowId]
      const localKey = `admin_unsaved_${id}_${gridClass}_${gridSection}_${filterSubject}`
      if (Object.keys(editChanges.current).length === 0) localStorage.removeItem(localKey)
      else localStorage.setItem(localKey, JSON.stringify(editChanges.current))

      setTimeout(() => {
        setSavingRows(prev => {
          const newStatus = { ...prev }
          if (newStatus[rowId] === 'success') delete newStatus[rowId]
          return newStatus
        })
      }, 3000)
    } else {
      setSavingRows(prev => ({ ...prev, [rowId]: 'pending' })) // revert on error
      alert('Error: ' + error.message)
    }
  }

  async function saveAllChanges() {
    const rowIds = Object.keys(editChanges.current)
    if (rowIds.length === 0) return

    setStatus(`💾 Saving changes for ${rowIds.length} students...`)
    let done = 0
    for (const rid of rowIds) {
      const row = getRowById(rid)
      if (row) syncDraftTotal(rid, row, filterSubject)
      if (!editChanges.current[rid]) {
        setSavingRows(prev => ({ ...prev, [rid]: 'pending' }))
        continue
      }
      setSavingRows(prev => ({ ...prev, [rid]: 'saving' }))
      const { error } = await supabase.from('FMHS_exam_data').update(editChanges.current[rid]).eq('id', rid)
      if (!error) {
        done++
        setSavingRows(prev => ({ ...prev, [rid]: 'success' }))
        delete editChanges.current[rid]
      } else {
        setSavingRows(prev => ({ ...prev, [rid]: 'pending' }))
      }
    }
    
    // CLEAR LOCAL STORAGE
    const localKey = `admin_unsaved_${id}_${gridClass}_${gridSection}_${filterSubject}`
    if (Object.keys(editChanges.current).length === 0) localStorage.removeItem(localKey)
    else localStorage.setItem(localKey, JSON.stringify(editChanges.current))

    setStatus(`✅ Successfully saved ${done} records.`)
    setTimeout(() => {
        setStatus('')
        setSavingRows({})
    }, 5000)
  }

  async function resetLocalChanges() {
    if (!confirm('Are you sure? This will clear all unsaved changes for this selection and reload data from the database.')) return
    const localKey = `admin_unsaved_${id}_${gridClass}_${gridSection}_${filterSubject}`
    localStorage.removeItem(localKey)
    editChanges.current = {}
    setSavingRows({})
    await loadMarksExplicitly(gridClass, gridSection, filterSubject)
    setStatus('🔄 Local changes cleared. Original data reloaded.')
    setTimeout(() => setStatus(''), 3000)
  }

  async function handleProcessResults() {
    if (!confirm('This will recalculate all Totals and GPAs for EVERY student in this exam. Continue?')) return
    setLoading(true)
    setStatus('⚡ Processing started...')
    try {
      const count = await processExamResults(Number(id), (msg) => setStatus(msg))
      setStatus(`✅ Successfully processed ${count} students!`)
      loadMarks()
      loadReportSummary()
    } catch (e: any) {
      alert(e.message)
      setStatus('❌ Processing failed.')
    }
    setLoading(false)
  }


  async function toggleStatus(field: 'is_live' | 'teacher_entry_enabled', current: boolean) {
    const { error } = await supabase.from('FMHS_exams_names').update({ [field]: !current }).eq('id', id)
    if (error) alert(error.message)
    else loadExamData()
  }

  async function saveClassCounts() {
    setStatus('💾 Saving configuration...')
    const { error } = await supabase.from('FMHS_exams_names').update({
      class_6: draftCounts[6],
      class_7: draftCounts[7],
      class_8: draftCounts[8],
      class_9: draftCounts[9],
      class_10: draftCounts[10],
      class_11: draftCounts[11],
      class_12: draftCounts[12],
    }).eq('id', id)

    if (error) {
      alert(error.message)
      setStatus('❌ Save failed.')
    } else {
      setStatus('✅ Configuration saved successfully!')
      setIsEditingCounts(false)
      loadExamData()
      setTimeout(() => setStatus(''), 3000)
    }
  }

  async function importStudents() {
    if (!exam || !gridClass || !sourceYear) { alert('Please select class and year.'); return }
    setStatus(`🔍 Scanning database for ${sourceYear} session...`)
    
    const classCol = `class_${sourceYear}`
    const sectionCol = `section_${sourceYear}`
    const rollCol = `roll_${sourceYear}`

    let students: any[] = []
    let from = 0; let to = 999; let hasMore = true
    while (hasMore) {
      let q = supabase.from('student_database')
        .select(`iid, student_name_en, father_name_en, status, ${classCol}, ${sectionCol}, ${rollCol}`)
        .eq(classCol, gridClass)
        .or('status.is.null,status.neq.TC')
      if (gridSection && gridSection !== 'All') q = q.eq(sectionCol, gridSection)
      const { data, error } = await q.range(from, to)
      if (error) { alert(`Error fetching students: ${error.message}`); return }
      if (data && data.length > 0) {
        students = [...students, ...data]
        if (data.length < 1000) hasMore = false
        else { from += 1000; to += 1000 }
      } else { hasMore = false }
    }
    if (students.length === 0) { alert(`No active students (non-TC) found for Class ${gridClass} in ${sourceYear}.`); return }

    setStatus(`📦 Importing ${students.length} students...`)
    
    let existing: any[] = []
    from = 0; to = 999; hasMore = true
    while (hasMore) {
      const { data, error } = await supabase.from('FMHS_exam_data').select('iid').eq('exam_id', id).range(from, to)
      if (error) break
      if (data && data.length > 0) {
        existing = [...existing, ...data]
        if (data.length < 1000) hasMore = false
        else { from += 1000; to += 1000 }
      } else { hasMore = false }
    }
    const existingIds = new Set(existing.map(e => String(e.iid)))
    
    const newStudents = (students as any[]).filter((s: any) => !existingIds.has(String(s.iid)))
    if (newStudents.length === 0) {
      alert(`All students already imported.`)
      setStatus('No new students found.')
      return
    }

    const toInsert = (newStudents as any[]).map((s: any) => ({
      exam_id: id,
      iid: s.iid,
      class: Number(s[classCol]),
      section: s[sectionCol],
      roll: Number(s[rollCol]),
      student_name_en: s.student_name_en,
      father_name_en: s.father_name_en,
      exam_name_year: `${exam?.exam_name}-${exam?.year}`,
      status: 'Pending'
    }))

    const { error: insErr } = await supabase.from('FMHS_exam_data').insert(toInsert)
    if (insErr) {
      alert(insErr.message)
    } else {
      setStatus(`✅ Successfully imported ${newStudents.length} students!`)
      loadMarks()
      loadMetadata()
    }
  }

  if (loading && !exam) return <div className="spinner" />

  const tabStyle = (tab: string) => ({
    padding: '12px 24px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: '14px',
    borderRadius: '12px',
    background: activeTab === tab ? '#4f46e5' : 'transparent',
    color: activeTab === tab ? '#fff' : '#64748b',
    border: 'none',
    transition: '0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#1e293b', fontFamily: "'Outfit', sans-serif" }}>
      
      {/* HEADER */}
      <header style={{ background: '#fff', padding: '16px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#64748b', padding: '8px 16px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>← EXIT</button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>{exam?.exam_name}</h1>
            <p style={{ margin: 0, fontSize: '11px', color: '#4f46e5', fontWeight: 800 }}>ADMIN COMMAND CENTER • {exam?.year} SESSION</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
           <button onClick={saveAllChanges} style={{ padding: '10px 24px', borderRadius: '12px', background: '#059669', color: '#fff', border: 'none', fontWeight: 800, boxShadow: '0 4px 10px rgba(5,150,105,0.2)' }}>SAVE CHANGES</button>
           <button onClick={handleProcessResults} style={{ padding: '10px 24px', borderRadius: '12px', background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 800, boxShadow: '0 4px 10px rgba(79,70,229,0.2)' }}>PROCESS GPA</button>
        </div>
      </header>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 20px' }}>
        
        {/* TAB NAVIGATION */}
        <div style={{ display: 'flex', gap: '8px', background: '#fff', padding: '6px', borderRadius: '16px', border: '1px solid #e2e8f0', width: 'fit-content', marginBottom: '32px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', flexWrap: 'wrap' }}>
           <button onClick={() => setActiveTab('overview')} style={tabStyle('overview')}>🏠 Overview</button>
           <button onClick={() => setActiveTab('setup')} style={tabStyle('setup')}>⚙️ Setup & Configuration</button>
           <button onClick={() => setActiveTab('marks')} style={tabStyle('marks')}>✍️ Mark Entry</button>
           
           <div style={{ width: '1px', height: '24px', background: '#e2e8f0', alignSelf: 'center', margin: '0 4px' }}></div>
           

           <button onClick={() => navigate(`/subject-gpa/${id}`)} style={tabStyle('')}>🧪 Subject GPA</button>
           <button onClick={() => navigate(`/gpa-final/${id}`)} style={tabStyle('')}>🎯 GPA Final</button>
           
           <div style={{ width: '1px', height: '24px', background: '#e2e8f0', alignSelf: 'center', margin: '0 4px' }}></div>
           
           <button onClick={() => setActiveTab('reports')} style={tabStyle('reports')}>📊 Final Reports</button>
           <button onClick={() => setActiveTab('optional')} style={tabStyle('optional')}>🛠️ Optional</button>
        </div>

        <div style={{ minHeight: '60vh' }}>
            
            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'overview' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '40px' }}>
                  <div style={{ padding: '32px', borderRadius: '24px', background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>LIVE PORTAL STATUS</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '1.4rem', fontWeight: 900, color: exam?.is_live ? '#059669' : '#f43f5e' }}>{exam?.is_live ? 'ACTIVE' : 'OFFLINE'}</span>
                      <button onClick={() => toggleStatus('is_live', !!exam?.is_live)} style={{ padding: '8px 16px', borderRadius: '10px', background: exam?.is_live ? '#fee2e2' : '#dcfce7', border: 'none', color: exam?.is_live ? '#ef4444' : '#15803d', fontWeight: 800 }}>{exam?.is_live ? 'PAUSE' : 'START'}</button>
                    </div>
                  </div>
                  <div style={{ padding: '32px', borderRadius: '24px', background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>TEACHER ENTRY ACCESS</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '1.4rem', fontWeight: 900, color: exam?.teacher_entry_enabled ? '#4f46e5' : '#64748b' }}>{exam?.teacher_entry_enabled ? 'ENABLED' : 'DISABLED'}</span>
                      <button onClick={() => toggleStatus('teacher_entry_enabled', !!exam?.teacher_entry_enabled)} style={{ padding: '8px 16px', borderRadius: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', fontWeight: 800 }}>TOGGLE</button>
                    </div>
                  </div>
                  <div style={{ padding: '32px', borderRadius: '24px', background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px' }}>TOTAL ENROLLMENT</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{totalEnrolled !== null ? totalEnrolled : '...'} Students</div>
                  </div>
                </div>

                <div style={{ background: '#fff', borderRadius: '32px', border: '1px solid #e2e8f0', padding: '40px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}>
                  <h3 style={{ margin: '0 0 32px 0', fontWeight: 900, fontSize: '1.5rem' }}>Administrative Workflow Guide</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '32px' }}>
                    {[
                      { step: 1, title: 'Import Students', desc: 'Load student data from global database.', active: true },
                      { step: 2, title: 'Configure Subjects', desc: 'Define pass marks and full marks.', active: subjectRules.length > 0 },
                      { step: 3, title: 'Teacher Access', desc: 'Assign subjects to respective teachers.', active: true },
                      { step: 4, title: 'Mark Entry', desc: 'Fill in marks via Admin or Teacher portal.', active: data.length > 0 },
                      { step: 5, title: 'Process GPA', desc: 'Run the engine to calculate final grades.', active: true }
                    ].map(s => (
                      <div key={s.step} style={{ position: 'relative' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: s.active ? '#4f46e5' : '#f1f5f9', color: s.active ? '#fff' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, marginBottom: '16px' }}>{s.step}</div>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', fontWeight: 800 }}>{s.title}</h4>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.5' }}>{s.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── SETUP TAB ── */}
            {activeTab === 'setup' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                <div style={{ background: '#fff', padding: '32px', borderRadius: '32px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ margin: '0 0 24px 0', fontWeight: 900 }}>1. Load Students</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>SOURCE YEAR</label>
                      <select className="form-control" style={{ borderRadius: '12px' }} value={sourceYear} onChange={e => setSourceYear(e.target.value)}>
                        <option value="">Select Year</option>
                        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>TARGET CLASS</label>
                      <select className="form-control" style={{ borderRadius: '12px' }} value={gridClass} onChange={e => setGridClass(e.target.value)}>
                        <option value="">Select Class</option>
                        {sourceClasses.map(c => <option key={c} value={c}>Class {c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: '32px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>TARGET SECTION</label>
                    <select className="form-control" style={{ borderRadius: '12px' }} value={gridSection} onChange={e => setGridSection(e.target.value)}>
                      <option value="All">All Sections</option>
                      {(sourceSectionsByClass[gridClass] || []).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <button onClick={importStudents} style={{ width: '100%', padding: '16px', borderRadius: '16px', background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 800 }}>IMPORT {previewCount !== null ? `${previewCount} ` : ''}STUDENTS</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{ background: '#fff', padding: '32px', borderRadius: '32px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontWeight: 900 }}>2. Subject Rules</h3>
                    <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>Define which subjects belong to this exam and their pass criteria.</p>
                    <button onClick={() => navigate(`/exam-subjects/${id}`)} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: '#f1f5f9', border: '1px solid #e2e8f0', fontWeight: 700, color: '#1e293b' }}>MANAGE SUBJECT RULES ({subjectRules.length})</button>
                  </div>
                  <div style={{ background: '#fff', padding: '32px', borderRadius: '32px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontWeight: 900 }}>3. Teacher Access</h3>
                    <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>Grant access to teachers for specific classes and subjects.</p>
                    <button onClick={() => navigate(`/exam-teachers/${id}`)} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: '#f1f5f9', border: '1px solid #e2e8f0', fontWeight: 700, color: '#1e293b' }}>CONFIGURE ACCESS PERMISSIONS</button>
                  </div>

                  <div style={{ background: '#fff', padding: '32px', borderRadius: '32px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontWeight: 900 }}>📚 Total Subjects Configuration (GPA Divisors)</h3>
                      {!isEditingCounts ? (
                        <button onClick={() => setIsEditingCounts(true)} style={{ padding: '8px 20px', borderRadius: '12px', background: '#f1f5f9', border: '1px solid #e2e8f0', fontWeight: 800, color: '#4f46e5', cursor: 'pointer' }}>✏️ Edit Settings</button>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => { setIsEditingCounts(false); loadExamData(); }} style={{ padding: '8px 20px', borderRadius: '12px', background: '#fff', border: '1px solid #e2e8f0', fontWeight: 800, color: '#64748b', cursor: 'pointer' }}>Cancel</button>
                          <button onClick={saveClassCounts} style={{ padding: '8px 24px', borderRadius: '12px', background: '#059669', border: 'none', fontWeight: 800, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 10px rgba(5,150,105,0.2)' }}>Save Configuration</button>
                        </div>
                      )}
                    </div>
                    <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>Set the total number of subjects to divide by when calculating the final GPA for each class.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '20px' }}>
                      {[6, 7, 8, 9, 10, 11, 12].map(c => (
                        <div key={c} style={{ background: isEditingCounts ? '#fff' : '#f8fafc', padding: '16px', borderRadius: '20px', border: isEditingCounts ? '2px solid #4f46e5' : '1px solid #e2e8f0', transition: '0.2s' }}>
                          <div style={{ fontSize: '11px', fontWeight: 900, color: '#64748b', marginBottom: '8px', textAlign: 'center' }}>CLASS {c}</div>
                          {isEditingCounts ? (
                            <input 
                              type="number" 
                              className="form-control" 
                              style={{ textAlign: 'center', fontWeight: 900, fontSize: '1.2rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                              value={draftCounts[c] || 0}
                              onChange={(e) => setDraftCounts({ ...draftCounts, [c]: Number(e.target.value) })}
                            />
                          ) : (
                            <div style={{ textAlign: 'center', fontWeight: 900, fontSize: '1.5rem', color: '#1e293b' }}>
                              {exam ? (exam as any)[`class_${c}`] : 0}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── MARKS TAB ── */}
            {activeTab === 'marks' && (
              <div style={{ background: '#fff', borderRadius: '32px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}>
                <div style={{ padding: '32px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                   <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-end' }}>
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>1. Select Class</label>
                        <select className="form-control" style={{ borderRadius: '14px', padding: '12px', fontWeight: 700 }} value={gridClass} onChange={e => { setGridClass(e.target.value); setGridSection('All'); setFilterSubject(''); setData([]); }}>
                          <option value="">Choose Class...</option>
                          {availableClasses.map(c => <option key={c} value={c}>Class {c}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>2. Select Section</label>
                        <select className="form-control" style={{ borderRadius: '14px', padding: '12px', fontWeight: 700 }} value={gridSection} onChange={e => { setGridSection(e.target.value); setFilterSubject(''); setData([]); }}>
                          <option value="All">All Sections</option>
                          {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 2, minWidth: '220px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>3. Select Subject (Auto-Load)</label>
                        <select 
                          className="form-control" 
                          disabled={!gridClass}
                          style={{ borderRadius: '14px', padding: '12px', fontWeight: 700, border: filterSubject ? '2px solid #4f46e5' : '1px solid #e2e8f0', background: !gridClass ? '#f1f5f9' : '#fff' }} 
                          value={filterSubject} 
                          onChange={e => { 
                            setFilterSubject(e.target.value); 
                            if (e.target.value) {
                                // We need to pass the values directly because state update is async
                                loadMarksExplicitly(gridClass, gridSection, e.target.value);
                            } else {
                                setData([]);
                            }
                          }}
                        >
                          <option value="">-- Choose Subject to Start Entry --</option>
                          {Object.keys(subjectMap).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                   </div>
                   
                   {loading && (
                     <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '10px', color: '#4f46e5', fontWeight: 700 }}>
                        <div className="spinner-small" style={{ width: '16px', height: '16px', border: '2px solid #eef2ff', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                        <span>Loading student data...</span>
                     </div>
                   )}

                   {data.length > 0 && filterSubject && !loading && (
                     <div style={{ marginTop: '24px', display: 'flex', gap: '12px', alignItems: 'center', background: '#fff', padding: '12px 20px', borderRadius: '16px', border: '1px solid #e2e8f0', width: '100%', justifyContent: 'space-between', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }}></div>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                            Editing: <span style={{ color: '#4f46e5' }}>{filterSubject}</span> | Class {gridClass} ({gridSection})
                          </span>
                          <div style={{ width: '1px', height: '16px', background: '#e2e8f0', margin: '0 8px' }}></div>
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{data.length} Students Loaded</span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <button 
                             onClick={resetLocalChanges}
                             style={{ padding: '8px 16px', borderRadius: '12px', border: '1px solid #fee2e2', background: '#fff', color: '#ef4444', fontSize: '11px', fontWeight: 800, cursor: 'pointer', transition: '0.2s' }}
                          >
                             🔄 RESET CHANGES
                          </button>
                          <button 
                             onClick={() => setShowDetails(!showDetails)}
                             style={{ padding: '8px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: showDetails ? '#f8fafc' : '#fff', color: '#64748b', fontSize: '11px', fontWeight: 800, cursor: 'pointer', transition: '0.2s' }}
                          >
                             {showDetails ? '🙈 HIDE NAMES' : '👁️ SHOW NAMES'}
                          </button>
                        </div>
                     </div>
                   )}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <tr>
                        {fixedCols.map((c: string) => <th key={c} style={{ padding: '16px', textAlign: 'left', fontWeight: 900, textTransform: 'uppercase', fontSize: '11px', color: '#64748b' }}>{c}</th>)}

                        {showDetails && (
                          <>
                            <th style={{ padding: '16px', textAlign: 'left', fontWeight: 900, textTransform: 'uppercase', fontSize: '11px', color: '#64748b' }}>STUDENT NAME</th>
                            <th style={{ padding: '16px', textAlign: 'left', fontWeight: 900, textTransform: 'uppercase', fontSize: '11px', color: '#64748b' }}>IID</th>
                          </>
                        )}
                        {filterSubject ? (() => {
                          const rule = subjectRules.find(r => r.subject_name === filterSubject);
                          return (
                            <>
                              {subjectMap[filterSubject].CQ && (
                                <th style={{ padding: '16px', textAlign: 'center', fontSize: '11px' }}>
                                  CQ <div style={{ fontSize: '9px', color: '#ef4444', fontWeight: 800 }}>P: {rule?.pass_cq}</div>
                                </th>
                              )}
                              {subjectMap[filterSubject].MCQ && (
                                <th style={{ padding: '16px', textAlign: 'center', fontSize: '11px' }}>
                                  MCQ <div style={{ fontSize: '9px', color: '#ef4444', fontWeight: 800 }}>P: {rule?.pass_mcq}</div>
                                </th>
                              )}
                              {subjectMap[filterSubject].Practical && (
                                <th style={{ padding: '16px', textAlign: 'center', fontSize: '11px' }}>
                                  PRAC <div style={{ fontSize: '9px', color: '#ef4444', fontWeight: 800 }}>P: {rule?.pass_practical}</div>
                                </th>
                              )}
                              <th style={{ padding: '16px', textAlign: 'center', background: '#eef2ff', fontSize: '11px' }}>
                                TOTAL <div style={{ fontSize: '9px', color: '#4f46e5', fontWeight: 800 }}>P: {rule?.pass_total}</div>
                              </th>
                              <th style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '11px', fontWeight: 800 }}>ACTION</th>
                            </>
                          );
                        })() : (
                          Object.keys(subjectMap).map(s => <th key={s} style={{ padding: '16px', textAlign: 'center', minWidth: '100px', fontWeight: 900, textTransform: 'uppercase', fontSize: '11px', color: '#64748b' }}>{s}</th>)
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data.map(row => (
                        <tr key={String(row.id)} style={{ borderBottom: '1px solid #f1f5f9', transition: '0.1s' }}>
                          {fixedCols.map((c: string) => <td key={c} style={{ padding: '16px', fontWeight: 900 }}>{String(row[c] ?? '-')}</td>)}
                          {showDetails && (
                            <>
                              <td style={{ padding: '16px', fontWeight: 600 }}>{String(row.student_name_en ?? '-')}</td>
                              <td style={{ padding: '16px', fontSize: '11px', color: '#64748b' }}>{String(row.iid ?? '-')}</td>
                            </>
                          )}
                          {filterSubject ? (
                            <>
                              {subjectMap[filterSubject].CQ && (
                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                  <input 
                                    type="number" 
                                    value={String(row[subjectMap[filterSubject].CQ!] ?? '')} 
                                    onChange={e => {
                                      const val = e.target.value;
                                      handleEdit(String(row.id), subjectMap[filterSubject].CQ!, val);
                                      const newData = [...data];
                                      const idx = newData.findIndex(r => String(r.id) === String(row.id));
                                      if (idx !== -1) {
                                        newData[idx][subjectMap[filterSubject].CQ!] = val === '' ? null : Number(val);
                                        setData(newData);
                                      }
                                    }} 
                                    style={{ width: '70px', padding: '8px', textAlign: 'center', borderRadius: '8px', border: '1px solid #e2e8f0' }} 
                                  />
                                </td>
                              )}
                              {subjectMap[filterSubject].MCQ && (
                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                  <input 
                                    type="number" 
                                    value={String(row[subjectMap[filterSubject].MCQ!] ?? '')} 
                                    onChange={e => {
                                      const val = e.target.value;
                                      handleEdit(String(row.id), subjectMap[filterSubject].MCQ!, val);
                                      const newData = [...data];
                                      const idx = newData.findIndex(r => String(r.id) === String(row.id));
                                      if (idx !== -1) {
                                        newData[idx][subjectMap[filterSubject].MCQ!] = val === '' ? null : Number(val);
                                        setData(newData);
                                      }
                                    }} 
                                    style={{ width: '70px', padding: '8px', textAlign: 'center', borderRadius: '8px', border: '1px solid #e2e8f0' }} 
                                  />
                                </td>
                              )}
                              {subjectMap[filterSubject].Practical && (
                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                  <input 
                                    type="number" 
                                    value={String(row[subjectMap[filterSubject].Practical!] ?? '')} 
                                    onChange={e => {
                                      const val = e.target.value;
                                      handleEdit(String(row.id), subjectMap[filterSubject].Practical!, val);
                                      const newData = [...data];
                                      const idx = newData.findIndex(r => String(r.id) === String(row.id));
                                      if (idx !== -1) {
                                        newData[idx][subjectMap[filterSubject].Practical!] = val === '' ? null : Number(val);
                                        setData(newData);
                                      }
                                    }} 
                                    style={{ width: '70px', padding: '8px', textAlign: 'center', borderRadius: '8px', border: '1px solid #e2e8f0' }} 
                                  />
                                </td>
                              )}
                              <td style={{ padding: '16px', textAlign: 'center', fontWeight: 900, color: '#4f46e5', background: '#f5f7ff' }}>{String(row[subjectMap[filterSubject].Total!] ?? '-')}</td>
                              <td style={{ padding: '12px', textAlign: 'center' }}>
                                <button
                                  onClick={() => saveRow(String(row.id))}
                                  disabled={savingRows[String(row.id)] === 'saving'}
                                  style={{
                                    padding: '8px 16px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    fontWeight: 800,
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    transition: '0.2s',
                                    background: 
                                      savingRows[String(row.id)] === 'pending' ? '#f59e0b' : 
                                      savingRows[String(row.id)] === 'success' ? '#10b981' : 
                                      savingRows[String(row.id)] === 'saving' ? '#94a3b8' : '#f1f5f9',
                                    color: (savingRows[String(row.id)] === 'pending' || savingRows[String(row.id)] === 'success' || savingRows[String(row.id)] === 'saving') ? '#fff' : '#64748b'
                                  }}
                                >
                                  {savingRows[String(row.id)] === 'saving' ? '...' : 
                                   savingRows[String(row.id)] === 'success' ? 'SAVED ✅' : 
                                   savingRows[String(row.id)] === 'pending' ? 'SAVE' : 'SAVE'}
                                </button>
                              </td>
                            </>
                          ) : Object.keys(subjectMap).map(s => {
                            return (
                              <td key={s} style={{ padding: '16px', textAlign: 'center' }}>
                                <span style={{ fontWeight: 800, color: row[`*${s}_GPA`] === 'F' ? '#ef4444' : '#059669', fontSize: '14px' }}>
                                  {String(row[`*${s}_Total`] ?? '-')}
                                </span>
                                {String(row[`*${s}_GPA`] ?? '') && <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '4px' }}>Grade: {String(row[`*${s}_GPA`])}</span>}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── REPORTS TAB ── */}
            {activeTab === 'reports' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={{ padding: '32px', borderRadius: '24px', gridColumn: '1 / -1', background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ margin: '0 0 24px 0', fontSize: '1.4rem', fontWeight: 900 }}>📊 Live Session Summary</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                    <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 800 }}>TOTAL STUDENTS</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, marginTop: '4px' }}>{data.length}</div>
                    </div>
                    <div style={{ background: '#dcfce7', padding: '20px', borderRadius: '20px', border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 800 }}>PASSED</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#15803d', marginTop: '4px' }}>{summaryData.passCount}</div>
                    </div>
                    <div style={{ background: '#fee2e2', padding: '20px', borderRadius: '20px', border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: '11px', color: '#b91c1c', fontWeight: 800 }}>FAILED</div>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: '#b91c1c', marginTop: '4px' }}>{summaryData.failCount}</div>
                    </div>
                    <div style={{ background: '#e0e7ff', padding: '20px', borderRadius: '20px', border: '1px solid #c7d2fe' }}>
                      <div style={{ fontSize: '11px', color: '#4338ca', fontWeight: 800 }}>TOP PERFORMERS</div>
                      <div style={{ fontSize: '14px', marginTop: '8px' }}>
                        {summaryData.topStudents.map((s, idx) => (
                          <div key={idx} style={{ color: '#1e293b', fontSize: '11px', fontWeight: 700 }}>#{idx+1} {String(s.student_name_en || '').split(' ')[0]} ({String(s.total_mark ?? '')})</div>
                        ))}

                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '32px', borderRadius: '24px', textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '40px', marginBottom: '16px' }}>🏆</div>
                  <h3 style={{ marginBottom: '8px', fontWeight: 900 }}>Final Result List</h3>
                  <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '24px' }}>Complete merit list with GPAs and total marks.</p>
                  <button onClick={() => navigate(`/result-list/${id}`)} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: '#4f46e5', border: 'none', fontWeight: 800, color: '#fff' }}>Open Merit List</button>
                </div>
                <div style={{ padding: '32px', borderRadius: '24px', textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '40px', marginBottom: '16px' }}>❌</div>
                  <h3 style={{ marginBottom: '8px', fontWeight: 900 }}>Failure Analytics</h3>
                  <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '24px' }}>Identify students who failed one or more subjects.</p>
                  <button onClick={() => navigate(`/fail-report/${id}`)} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', fontWeight: 700 }}>View Fail Report</button>
                </div>
                <div style={{ padding: '32px', borderRadius: '24px', textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '40px', marginBottom: '16px' }}>🖨️</div>
                  <h3 style={{ marginBottom: '8px', fontWeight: 900 }}>Bulk Print</h3>
                  <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '24px' }}>Generate printable marksheets for the entire session.</p>
                  <button onClick={() => navigate(`/print-results/${id}`)} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', fontWeight: 700 }}>Print Center</button>
                </div>
                <div style={{ padding: '32px', borderRadius: '24px', textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '40px', marginBottom: '16px' }}>📱</div>
                  <h3 style={{ marginBottom: '8px', fontWeight: 900 }}>SMS Gateway</h3>
                  <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '24px' }}>Send results directly to parents via SMS.</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => navigate(`/sms`)} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: '#f1f5f9', border: '1px solid #e2e8f0', fontWeight: 700, fontSize: '12px' }}>Simple SMS</button>
                    <button onClick={() => navigate(`/sms-full/${id}`)} style={{ flex: 1, padding: '12px', borderRadius: '12px', background: '#4f46e5', border: 'none', fontWeight: 800, color: '#fff', fontSize: '12px' }}>Detailed SMS</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── OPTIONAL TAB ── */}
            {activeTab === 'optional' && (
              <div style={{ background: '#fff', padding: '40px', borderRadius: '32px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}>
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>🛠️ Optional Reports & Tools</h3>
                  <p style={{ color: '#64748b', fontSize: '15px', marginTop: '8px' }}>Access legacy processing tools, specialized analytics, and secondary reports.</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                  {[
                    { title: 'Result Processor', path: `/process-results/${id}`, icon: '⚡', desc: 'Alternative result processing engine.' },
                    { title: 'Detailed Result View', path: `/result-view/${id}`, icon: '🔍', desc: 'Inspect raw data for individual students.' },
                    { title: 'General Summary', path: `/summary`, icon: '📋', desc: 'High-level statistical overview.' },
                    { title: 'Full SMS Gateway', path: `/sms-full/${id}`, icon: '✉️', desc: 'Advanced messaging with full logs.' }
                  ].map(tool => (
                    <div 
                      key={tool.title} 
                      onClick={() => navigate(tool.path)}
                      style={{ 
                        padding: '24px', background: '#f8fafc', borderRadius: '24px', border: '1px solid #e2e8f0', 
                        cursor: 'pointer', transition: '0.2s', textAlign: 'left' 
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.transform = 'translateY(-4px)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.transform = 'translateY(0)' }}
                    >
                      <div style={{ fontSize: '32px', marginBottom: '16px' }}>{tool.icon}</div>
                      <h4 style={{ margin: '0 0 8px 0', fontWeight: 800 }}>{tool.title}</h4>
                      <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: '1.4' }}>{tool.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>

        {status && (
          <div style={{ position: 'fixed', bottom: '24px', right: '40px', background: '#0f172a', color: '#fff', padding: '12px 24px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', fontSize: '14px', fontWeight: 600, zIndex: 1000 }}>{status}</div>
        )}

        {/* EDIT SUBJECT MODAL */}
        {editingRule && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', borderRadius: '32px', padding: '40px', width: '500px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 900 }}>Edit {editingRule.subject_name} Rules</h3>
              <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '32px' }}>Update pass marks for this subject.</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
                {[
                  { label: 'Full Marks', key: 'full_marks' },
                  { label: 'Pass CQ', key: 'pass_cq' },
                  { label: 'Pass MCQ', key: 'pass_mcq' },
                  { label: 'Pass Practical', key: 'pass_practical' },
                  { label: 'Total Pass', key: 'pass_total' }
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#94a3b8', marginBottom: '6px' }}>{f.label.toUpperCase()}</label>
                    <input type="number" className="form-control" style={{ borderRadius: '12px', padding: '12px' }} value={String((editingRule as any)[f.key] ?? '')} onChange={e => setEditingRule({ ...editingRule, [f.key]: Number(e.target.value) })} />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-primary" style={{ flex: 2, borderRadius: '16px', padding: '16px', background: '#4f46e5', border: 'none', fontWeight: 800, color: '#fff' }} onClick={async () => {
                  const { error } = await supabase.from('FMHS_exam_subjects').update(editingRule).eq('id', editingRule.id)
                  if (error) alert(error.message)
                  else { setEditingRule(null); loadExamData() }
                }}>Save Changes</button>
                <button className="btn btn-secondary" style={{ flex: 1, borderRadius: '16px', padding: '16px', background: '#f1f5f9', border: 'none', fontWeight: 700, color: '#475569' }} onClick={() => setEditingRule(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

