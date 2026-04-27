import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'

interface SubjectRule {
  id: number
  exam_id: number
  subject_code: string
  subject_name: string
  full_marks: number
  pass_cq: number
  pass_mcq: number
  pass_practical: number
  pass_total: number
  total_cq: number
  total_mcq: number
  total_practical: number
  exam_class: any[] // JSONB column
}

export default function SubjectRulesPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [rules, setRules] = useState<SubjectRule[]>([])
  const [examName, setExamName] = useState('')
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [processing, setProcessing] = useState(false)
  const [masterSubjects, setMasterSubjects] = useState<{ name: string; code: string }[]>([])
  const [enrolledClasses, setEnrolledClasses] = useState<number[]>([])
  const [allSectionsByClass, setAllSectionsByClass] = useState<Record<number, string[]>>({})

  // State for adding/editing a subject
  const initialClasses = (baseClasses: number[]) => baseClasses.map(c => ({ 
    class: c, 
    selected: false, 
    is_fourth_subject: false, 
    exclude_from_rank: false,
    sections: [] // New: Specific sections for this subject in this class
  }))
  
  const [newSub, setNewSub] = useState({
    subject_code: '',
    subject_name: '',
    full_marks: 100,
    pass_cq: 0,
    pass_mcq: 0,
    pass_practical: 0,
    pass_total: 33,
    total_cq: 70,
    total_mcq: 30,
    total_practical: 0,
    classes: [] as any[]
  })

  useEffect(() => {
    loadData()
    loadMasterSubjects()
  }, [id])

  async function loadMasterSubjects() {
    const { data } = await supabase.from('FMHS_exam_subjects').select('subject_name, subject_code')
    if (data) {
      const unique: Record<string, string> = {}
      data.forEach(s => { if (s.subject_name) unique[s.subject_name] = s.subject_code })
      setMasterSubjects(Object.entries(unique).map(([name, code]) => ({ name, code })))
    }
  }

  async function loadData() {
    setLoading(true)
    const { data: examData } = await supabase.from('FMHS_exams_names').select('exam_name').eq('id', id).single()
    if (examData) setExamName(examData.exam_name)

    // 4. Sections for each class (STRICTLY from enrolled students for this exam)
    const { data: enrolledData } = await supabase.from('FMHS_exam_data').select('class, section').eq('exam_id', id)
    
    const uniqueCls = [...new Set((enrolledData ?? []).map(r => Number(r.class)).filter(Boolean))].sort((a, b) => a - b)
    setEnrolledClasses(uniqueCls)

    const secMap: Record<number, string[]> = {}
    
    // Fill strictly from imported data
    enrolledData?.forEach(r => {
      const c = Number(r.class); if (!c) return
      if (!secMap[c]) secMap[c] = []
      if (r.section && !secMap[c].includes(r.section)) {
        secMap[c].push(r.section)
      }
    })

    // Sort sections alphabetically
    Object.keys(secMap).forEach(k => secMap[Number(k)].sort())

    setAllSectionsByClass(secMap)

    const { data, error } = await supabase.from('FMHS_exam_subjects').select('*').eq('exam_id', id).order('subject_code', { ascending: true })
    if (error) alert('Error: ' + error.message)
    else setRules(data || [])
    
    setLoading(false)
  }

  function handleSubjectNameChange(name: string) {
    const found = masterSubjects.find(s => s.name === name)
    setNewSub({
      ...newSub,
      subject_name: name,
      subject_code: found ? found.code : newSub.subject_code
    })
  }

  async function saveSubject(e: React.FormEvent) {
    e.preventDefault()
    setProcessing(true)

    const payload = {
      exam_id: Number(id),
      subject_code: newSub.subject_code,
      subject_name: newSub.subject_name,
      full_marks: newSub.full_marks,
      pass_cq: newSub.pass_cq,
      pass_mcq: newSub.pass_mcq,
      pass_practical: newSub.pass_practical,
      pass_total: newSub.pass_total,
      total_cq: newSub.total_cq,
      total_mcq: newSub.total_mcq,
      total_practical: newSub.total_practical,
      exam_class: newSub.classes.filter(c => c.selected)
    }

    const { error } = editId
      ? await supabase.from('FMHS_exam_subjects').update(payload).eq('id', editId)
      : await supabase.from('FMHS_exam_subjects').insert([payload])

    if (error) { alert(error.message); setProcessing(false); return }

    if (!editId) await addColumnsToTable(newSub)

    alert(editId ? '✅ Subject updated!' : '✅ Subject created!')
    setProcessing(false); setEditId(null); setIsModalOpen(false); loadData()
    setNewSub({ ...newSub, subject_code: '', subject_name: '', classes: initialClasses(enrolledClasses) })
  }

  async function addColumnsToTable(sub: typeof newSub) {
    const base = `*${sub.subject_name.trim()}`
    const cols = []
    if (sub.total_cq > 0) cols.push(`add column if not exists "${base}_CQ" numeric`)
    if (sub.total_mcq > 0) cols.push(`add column if not exists "${base}_MCQ" numeric`)
    if (sub.total_practical > 0) cols.push(`add column if not exists "${base}_Practical" numeric`)
    cols.push(`add column if not exists "${base}_Total" numeric`, `add column if not exists "${base}_GPA" text`)
    for (const sql of cols) { await supabase.rpc('execute_sql', { query: `alter table FMHS_exam_data ${sql}` }) }
  }

  async function deleteRule(rid: number, name: string) {
    if (!confirm(`Remove "${name}"?`)) return
    const { error } = await supabase.from('FMHS_exam_subjects').delete().eq('id', rid)
    if (error) alert(error.message); else loadData()
  }

  function openEdit(r: SubjectRule) {
    setEditId(r.id)
    setNewSub({
      subject_code: r.subject_code,
      subject_name: r.subject_name,
      full_marks: r.full_marks,
      pass_cq: r.pass_cq,
      pass_mcq: r.pass_mcq,
      pass_practical: r.pass_practical,
      pass_total: r.pass_total,
      total_cq: r.total_cq,
      total_mcq: r.total_mcq,
      total_practical: r.total_practical,
      classes: enrolledClasses.map(c => {
        const found = (r.exam_class || []).find((x: any) => x.class === c)
        return found ? { ...found, sections: found.sections || [] } : { class: c, selected: false, is_fourth_subject: false, exclude_from_rank: false, sections: [] }
      })
    })
    setIsModalOpen(true)
  }

  async function toggleClassSelection(rule: SubjectRule, cls: number) {
    const currentClasses = rule.exam_class || []
    const found = currentClasses.find((c: any) => c.class === cls)
    let nextClasses = found ? currentClasses.filter((c: any) => c.class !== cls) : [...currentClasses, { class: cls, selected: true, is_fourth_subject: false, exclude_from_rank: false, sections: [] }]
    const { error } = await supabase.from('FMHS_exam_subjects').update({ exam_class: nextClasses }).eq('id', rule.id)
    if (error) alert(error.message); else loadData()
  }

  async function updateRuleFlag(rule: SubjectRule, cls: number, field: string, value: any) {
    const nextClasses = (rule.exam_class || []).map((c: any) => c.class === cls ? { ...c, [field]: value } : c)
    const { error } = await supabase.from('FMHS_exam_subjects').update({ exam_class: nextClasses }).eq('id', rule.id)
    if (error) alert(error.message); else loadData()
  }

  async function toggleSectionSelection(rule: SubjectRule, cls: number, sec: string) {
    const nextClasses = (rule.exam_class || []).map((c: any) => {
      if (c.class === cls) {
        const currentSecs = c.sections || []
        const nextSecs = currentSecs.includes(sec) ? currentSecs.filter((s: string) => s !== sec) : [...currentSecs, sec]
        return { ...c, sections: nextSecs }
      }
      return c
    })
    const { error } = await supabase.from('FMHS_exam_subjects').update({ exam_class: nextClasses }).eq('id', rule.id)
    if (error) alert(error.message); else loadData()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "'Outfit', sans-serif", color: '#1e293b' }}>
      <header style={{ background: '#fff', padding: '18px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate(`/exam-panel/${id}`)} style={{ background: '#f1f5f9', border: 'none', color: '#64748b', borderRadius: '12px', padding: '8px 16px', cursor: 'pointer', fontWeight: 700 }}>← Back</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900 }}>🍎 Class-Subject & Group Assignment</h1>
          <p style={{ margin: 0, fontSize: '11px', color: '#ec4899', fontWeight: 800 }}>{examName.toUpperCase()}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          <button onClick={() => { setEditId(null); setNewSub({ ...newSub, subject_code: '', subject_name: '', classes: initialClasses(enrolledClasses) }); setIsModalOpen(true); }} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '14px', fontWeight: 900, cursor: 'pointer', fontSize: '13px' }}>+ Add Subject Config</button>
        </div>
      </header>

      <main style={{ padding: '40px' }}>
        <div style={{ background: '#fff', borderRadius: '32px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' }}>
          {loading ? <div style={{ padding: '100px', textAlign: 'center' }}><div className="spinner" /></div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '220px', background: '#f8fafc', position: 'sticky', left: 0, zIndex: 5 }}>SUBJECT</th>
                    {enrolledClasses.map(c => <th key={c} style={thStyle}>Class {c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule, idx) => (
                    <tr key={rule.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                      <td style={{ ...tdStyle, fontWeight: 900, position: 'sticky', left: 0, zIndex: 4, background: idx % 2 === 0 ? '#fff' : '#fafbfc', borderRight: '2px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: '15px' }}>{rule.subject_name}</div>
                            <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '8px' }}>CODE: {rule.subject_code}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {rule.total_cq > 0 && <span style={passBadgeStyle('#eff6ff', '#2563eb')}>CQ: {rule.pass_cq}</span>}
                              {rule.total_mcq > 0 && <span style={passBadgeStyle('#fff7ed', '#ea580c')}>MCQ: {rule.pass_mcq}</span>}
                              {rule.total_practical > 0 && <span style={passBadgeStyle('#f0fdf4', '#166534')}>PR: {rule.pass_practical}</span>}
                              <span style={passBadgeStyle('#fdf2f8', '#be185d')}>Pass: {rule.pass_total}</span>
                            </div>
                          </div>
                          <button onClick={() => openEdit(rule)} style={{ border: 'none', background: '#f1f5f9', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}>✏️</button>
                        </div>
                      </td>
                      {enrolledClasses.map(cls => {
                        const config = (rule.exam_class || []).find((c: any) => c.class === cls)
                        const isSelected = !!config?.selected
                        const sections = allSectionsByClass[cls] || []
                        const selectedSecs = config?.sections || []

                        return (
                          <td key={cls} style={tdStyle}>
                            {isSelected ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <label style={flagStyle(config.is_fourth_subject, '#fdf2f8', '#db2777')}>
                                    <input type="checkbox" checked={config.is_fourth_subject} onChange={e => updateRuleFlag(rule, cls, 'is_fourth_subject', e.target.checked)} /> 4TH
                                  </label>
                                  <label style={flagStyle(config.exclude_from_rank, '#fff1f2', '#e11d48')}>
                                    <input type="checkbox" checked={config.exclude_from_rank} onChange={e => updateRuleFlag(rule, cls, 'exclude_from_rank', e.target.checked)} /> NO-RANK
                                  </label>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '8px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                  <div style={{ fontSize: '9px', fontWeight: 900, color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase' }}>Allowed Sections:</div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {sections.map(sec => (
                                      <button key={sec} onClick={() => toggleSectionSelection(rule, cls, sec)} style={secBadgeStyle(selectedSecs.includes(sec) || selectedSecs.length === 0)}>
                                        {sec}
                                      </button>
                                    ))}
                                    {selectedSecs.length === 0 && <span style={{ fontSize: '9px', color: '#f97316', fontWeight: 900 }}>[ALL]</span>}
                                  </div>
                                </div>
                                <button onClick={() => toggleClassSelection(rule, cls)} style={{ border: 'none', background: 'none', color: '#cbd5e1', fontSize: '9px', fontWeight: 900, cursor: 'pointer' }}>🗑️ REMOVE CLASS</button>
                              </div>
                            ) : <button onClick={() => toggleClassSelection(rule, cls)} style={addBtnStyle}>+</button>}
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
      </main>

      {isModalOpen && (
        <div style={overlayStyle} onClick={() => setIsModalOpen(false)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 900, marginBottom: '24px' }}>{editId ? '✏️ Edit Subject' : '✨ Add Subject'}</h2>
            <form onSubmit={saveSubject}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '20px' }}>
                <div><label style={labelStyle}>Code</label><input style={inputStyle} value={newSub.subject_code} onChange={e => setNewSub({ ...newSub, subject_code: e.target.value })} required /></div>
                <div><label style={labelStyle}>Subject Name</label><input list="master-subjects" style={inputStyle} value={newSub.subject_name} onChange={e => handleSubjectNameChange(e.target.value)} required /><datalist id="master-subjects">{masterSubjects.map(s => <option key={s.name} value={s.name} />)}</datalist></div>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Apply to Classes</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {enrolledClasses.map(cls => {
                    const idx = newSub.classes.findIndex(c => c.class === cls)
                    const isSel = idx !== -1 && newSub.classes[idx].selected
                    return <button key={cls} type="button" onClick={() => { const next = [...newSub.classes]; if (idx === -1) next.push({ class: cls, selected: true, is_fourth_subject: false, exclude_from_rank: false, sections: [] }); else next[idx].selected = !isSel; setNewSub({ ...newSub, classes: next }) }} style={classBtnStyle(isSel)}>Class {cls}</button>
                  })}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                {['total_cq', 'total_mcq', 'total_practical', 'full_marks'].map(f => <div key={f}><label style={labelStyle}>{f.replace('_', ' ').toUpperCase()}</label><input type="number" style={inputStyle} value={(newSub as any)[f]} onChange={e => setNewSub({ ...newSub, [f]: Number(e.target.value) })} /></div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
                {['pass_cq', 'pass_mcq', 'pass_practical', 'pass_total'].map(f => <div key={f}><label style={labelStyle}>{f.replace('_', ' ').toUpperCase()}</label><input type="number" style={inputStyle} value={(newSub as any)[f]} onChange={e => setNewSub({ ...newSub, [f]: Number(e.target.value) })} /></div>)}
              </div>
              <div style={{ display: 'flex', gap: '16px' }}><button type="submit" disabled={processing} style={saveBtnStyle}>{processing ? 'Saving...' : 'Save Configuration'}</button>{editId && <button type="button" onClick={() => deleteRule(editId, newSub.subject_name)} style={delBtnStyle}>Delete</button>}</div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = { padding: '16px 20px', fontSize: '11px', fontWeight: 900, color: '#64748b', textAlign: 'left', borderBottom: '2px solid #f1f5f9', textTransform: 'uppercase' }
const tdStyle: React.CSSProperties = { padding: '16px 20px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1.5px solid #e2e8f0', fontSize: '13px', fontWeight: 600, background: '#f8fafc', boxSizing: 'border-box' }
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }
const modalStyle: React.CSSProperties = { background: '#fff', borderRadius: '24px', padding: '32px', width: '90%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }
const saveBtnStyle: React.CSSProperties = { flex: 1, padding: '14px', borderRadius: '16px', background: '#ec4899', color: '#fff', border: 'none', fontWeight: 900, cursor: 'pointer' }
const delBtnStyle: React.CSSProperties = { background: '#fee2e2', color: '#ef4444', border: 'none', padding: '14px 20px', borderRadius: '16px', fontWeight: 900, cursor: 'pointer' }
const classBtnStyle = (sel: boolean): React.CSSProperties => ({ padding: '8px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: sel ? '#4f46e5' : '#f8fafc', color: sel ? '#fff' : '#475569', fontWeight: 800, cursor: 'pointer' })
const addBtnStyle: React.CSSProperties = { border: '2px dashed #f1f5f9', background: 'transparent', color: '#cbd5e1', width: '36px', height: '36px', borderRadius: '12px', fontSize: '18px', cursor: 'pointer' }
const flagStyle = (on: boolean, bg: string, color: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: '4px', background: on ? bg : '#f8fafc', padding: '5px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', cursor: 'pointer', fontSize: '10px', fontWeight: 900, color: on ? color : '#64748b' })
const secBadgeStyle = (sel: boolean): React.CSSProperties => ({ padding: '2px 6px', borderRadius: '6px', fontSize: '9px', fontWeight: 800, border: 'none', cursor: 'pointer', background: sel ? '#f97316' : '#e2e8f0', color: sel ? '#fff' : '#64748b' })
function passBadgeStyle(bg: string, color: string): React.CSSProperties { return { background: bg, color, padding: '2px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 900, whiteSpace: 'nowrap', border: `1px solid ${color}20` } }
