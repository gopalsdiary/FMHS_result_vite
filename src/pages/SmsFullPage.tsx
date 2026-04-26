import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'

interface Exam {
  id: number
  exam_name: string
  year: number
}

interface StudentFull {
  iid: string
  student_name_en?: string
  roll?: string
  section?: string
  class?: number
  total_mark?: number
  average_mark?: number
  gpa_final?: string
  status?: string
  class_rank?: number
  father_name_en?: string
  father_mobile?: string
  [key: string]: unknown
}

export default function SmsFullPage() {
  const { examId: urlExamId } = useParams()
  const [exams, setExams] = useState<Exam[]>([])
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [examId] = useState(urlExamId || '')
  
  const [gridClass, setGridClass] = useState('')
  const [gridSection, setGridSection] = useState('')
  const [availableClasses, setAvailableClasses] = useState<string[]>([])
  const [availableSections, setAvailableSections] = useState<string[]>([])
  
  const [students, setStudents] = useState<StudentFull[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [phoneMap, setPhoneMap] = useState<Map<string, string>>(new Map())
  const [, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [customMsg, setCustomMsg] = useState('')

  useEffect(() => {
    loadExams()
  }, [])

  async function loadExams() {
    const { data } = await supabase.from('FMHS_exams_names').select('id, exam_name, year').order('year', { ascending: false })
    if (data) setExams(data)
  }

  useEffect(() => {
    if (examId) {
      const ex = exams.find(e => String(e.id) === examId)
      setSelectedExam(ex || null)
      loadMetadata(Number(examId))
      setGridClass('')
      setGridSection('')
      setStudents([])
    }
  }, [examId, exams])

  async function loadMetadata(id: number) {
    const { data } = await supabase.from('fmhs_exam_data').select('class, section').eq('exam_id', id)
    if (data && data.length > 0) {
      setAvailableClasses(Array.from(new Set(data.map(r => String(r.class)))).sort((a, b) => Number(a) - Number(b)))
      setAvailableSections(Array.from(new Set(data.map(r => String(r.section)))).sort())
    }

    // Load subject short codes
    const { data: subData } = await supabase.from('FMHS_exam_subjects').select('subject_name, subject_code').eq('exam_id', id)
    if (subData) setSubjects(subData)
  }

  useEffect(() => {
    if (examId && (gridClass || gridClass === 'All')) {
      loadStudents()
    } else {
      setStudents([])
    }
  }, [gridClass, gridSection, examId])

  async function loadStudents() {
    if (!examId) return
    if (gridClass === '') return
    
    setLoading(true)
    setStatus('Loading students and contact details...')
    
    // 1. Load exam data
    let q = supabase.from('fmhs_exam_data').select('*').eq('exam_id', Number(examId))
    
    if (gridClass !== 'All' && gridClass !== '') {
      q = q.eq('class', Number(gridClass))
    }
    
    if (gridSection && gridSection !== 'All' && gridSection !== '') {
      q = q.eq('section', gridSection)
    }
    
    const { data: rows, error } = await q.order('class', { ascending: true }).order('roll', { ascending: true })
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }

    // 2. Load phone numbers from student_database
    const iids = (rows || []).map(r => r.iid).filter(Boolean)
    const { data: pData } = await supabase.from('student_database').select('iid, father_mobile, mother_mobile, guardian_mobile').in('iid', iids)
    const pMap = new Map()
    if (pData) {
      pData.forEach(p => {
        const phone = p.father_mobile || p.mother_mobile || p.guardian_mobile || ''
        if (phone) pMap.set(String(p.iid).trim(), String(phone))
      })
    }
    setPhoneMap(pMap)
    
    const finalRows = (rows ?? []) as StudentFull[]
    setStudents(finalRows)
    setStatus(`${finalRows.length} students loaded.`)
    setLoading(false)
  }

  function buildFullSms(s: StudentFull): string {
    const header = selectedExam ? selectedExam.exam_name : 'Result'
    
    // Custom mapping based on subject_Sms.csv
    const codeMap: Record<string, string> = {
      'Bangla 1st Paper': 'B1',
      'Bangla 2nd Paper': 'B2',
      'English 1st Paper': 'E1',
      'English 2nd Paper': 'E2',
      'Mathematics': 'Math',
      'Religion': 'Rel',
      'ICT': 'ICT',
      'Science': 'Sci',
      'Bangladesh And Global Studies': 'BGS'
    }

    // Build subject parts like B1-85, E1-92
    let subjectParts: string[] = []
    subjects.forEach(sub => {
      const fieldName = `*${sub.subject_name}_Total`
      const mark = s[fieldName]
      
      // Clean name for mapping (remove *)
      const cleanName = sub.subject_name.startsWith('*') ? sub.subject_name.substring(1) : sub.subject_name
      
      // Get short code from map, or fallback to first letter
      const shortCode = codeMap[cleanName] || (cleanName.charAt(0).toUpperCase())
      
      if (mark !== undefined && mark !== null && mark !== '') {
        subjectParts.push(`${shortCode}-${mark}`)
      }
    })
    const subjectStr = subjectParts.join(', ')

    let smsText = `Dear ${s.student_name_en}, your ${header} ${selectedExam?.year || ''} ${subjectStr}`
    if (s.gpa_final) smsText += `, GPA-${s.gpa_final}`
    if (s.class_rank) smsText += `, rank-${s.class_rank}`
    if (s.status) smsText += `, ${s.status}`
    
    smsText += `, total mark is ${s.total_mark || 0}. Headmaster, Feni Model High School.`
    
    if (customMsg) smsText += ` ${customMsg}`
    return smsText
  }

  function copyAll() {
    const text = students
      .filter(s => Number(s.total_mark) > 0)
      .map(s => {
        const phone = phoneMap.get(String(s.iid).trim()) || ''
        return `${phone}\t${buildFullSms(s)}`
      }).join('\n')
    navigator.clipboard.writeText(text).then(() => setStatus('✅ Copied Phone and SMS for active students!'))
  }

  function exportCsv() {
    const header = ['father_mobile', 'sms_text']
    const rows = students
      .filter(s => Number(s.total_mark) > 0)
      .map(s => [
        phoneMap.get(String(s.iid).trim()) || '',
        buildFullSms(s)
      ])
    const csv = [header.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `sms_export_${gridClass}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // Helper to calculate SMS segments
  function getSegments(text: string): number {
    const len = text.length
    if (len === 0) return 0
    if (len <= 160) return 1
    return Math.ceil(len / 153)
  }
  const activeStudents = students.filter(s => Number(s.total_mark) > 0)
  // Each message count as (segments + 1) per user request
  const rawSegments = activeStudents.reduce((sum, s) => {
    const segs = getSegments(buildFullSms(s))
    return sum + (segs > 0 ? segs + 1 : 0)
  }, 0)
    // Calculate adjusted segments with buffer
  let displayedSegments = rawSegments
  if (rawSegments > 500) {
    displayedSegments = Math.ceil(rawSegments * 1.5)
  } else if (rawSegments > 100) {
    displayedSegments = Math.ceil(rawSegments * 1.3)
  }

  // Cost calculation: total * 0.45 + 15% VAT
  const estimatedCost = (displayedSegments * 0.45) * 1.15

  return (
    <PageShell title="Full SMS Generator">
      {() => (
        <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '20px' }}>
          
          <div className="card" style={{ padding: '24px', borderRadius: '20px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
            {!examId ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#ef4444', fontWeight: 700 }}>
                ⚠️ No examination selected. Please open this page from the Exam Panel.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>CLASS</label>
                  <select className="form-control" value={gridClass} onChange={e => setGridClass(e.target.value)} style={{ borderRadius: '12px' }}>
                    <option value="">Select Class</option>
                    <option value="All">All Classes</option>
                    {availableClasses.map(c => <option key={c} value={c}>Class {c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>SECTION</label>
                  <select className="form-control" value={gridSection} onChange={e => setGridSection(e.target.value)} style={{ borderRadius: '12px' }}>
                    <option value="All">All Sections</option>
                    {availableSections.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div style={{ marginTop: '20px' }}>
              <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '6px' }}>CUSTOM FOOTER MESSAGE (Optional)</label>
              <input 
                type="text" 
                className="form-control" 
                value={customMsg} 
                onChange={e => setCustomMsg(e.target.value)} 
                placeholder="e.g. Contact school office for details." 
                style={{ borderRadius: '12px' }}
              />
            </div>

            {status && <div style={{ marginTop: '16px', fontSize: '13px', fontWeight: 700, color: '#4f46e5' }}>{status}</div>}
          </div>

          {students.length > 0 && (
            <div className="card" style={{ padding: 0, borderRadius: '24px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
               <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>Found {students.length} Students</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff1f2', padding: '6px 16px', borderRadius: '12px', border: '1px solid #fecdd3' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#e11d48' }}>🚀 {activeStudents.length} Students</span>
                      <div style={{ width: '1px', height: '16px', background: '#fda4af' }}></div>
                      <span style={{ fontSize: '18px', fontWeight: 900, color: '#be123c' }}>
                        Total SMS : <span style={{ fontSize: '26px' }}>{displayedSegments}</span>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#fb7185', marginLeft: '12px', background: '#fff', padding: '2px 8px', borderRadius: '6px' }}>
                          Est. Cost: ৳{estimatedCost.toFixed(2)}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={copyAll} style={{ padding: '8px 16px', borderRadius: '10px', background: '#4f46e5', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>📋 Copy Mobile & SMS</button>
                    <button onClick={exportCsv} style={{ padding: '8px 16px', borderRadius: '10px', background: '#059669', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>⬇ Export CSV</button>
                  </div>
               </div>
               <div style={{ overflowX: 'auto', maxHeight: '800px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                      <tr>
                        <th style={thStyle}>Roll</th>
                        <th style={thStyle}>Name</th>
                        <th style={thStyle}>Phone</th>
                        <th style={thStyle}>GPA</th>
                        <th style={thStyle}>SMS CONTENT</th>
                        <th style={thStyle}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeStudents.map((s, idx) => {
                        const sms = buildFullSms(s)
                        const phone = phoneMap.get(String(s.iid).trim()) || '-'
                        return (
                          <tr key={s.iid} style={{ background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                            <td style={tdStyle}>{s.roll}</td>
                            <td style={{ ...tdStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>{s.student_name_en}</td>
                            <td style={tdStyle}>{phone}</td>
                            <td style={{ ...tdStyle, fontWeight: 900, color: s.gpa_final === 'F' ? '#ef4444' : '#059669' }}>{s.gpa_final}</td>
                            <td style={{ ...tdStyle, color: '#475569', maxWidth: '500px' }}>{sms}</td>
                            <td style={tdStyle}>
                              <button onClick={() => { navigator.clipboard.writeText(`${phone}\t${sms}`); setStatus(`Copied Roll ${s.roll}`) }} style={{ padding: '4px 10px', borderRadius: '6px', background: '#fff', border: '1px solid #4f46e5', color: '#4f46e5', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}>Copy</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
               </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontWeight: 800,
  color: '#64748b',
  borderBottom: '1px solid #e2e8f0',
  fontSize: '11px',
  textTransform: 'uppercase'
}

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #f1f5f9',
  color: '#1e293b'
}

