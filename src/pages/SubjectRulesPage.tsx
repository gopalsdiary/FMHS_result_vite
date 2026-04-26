import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'

interface SubjectRule {
  id: number
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
  exam_class?: any[]
}

const initialClasses = () => [6, 7, 8, 9, 10, 11, 12].map(c => ({ class: c, selected: false, is_fourth_subject: false, exclude_from_rank: false }));

export default function SubjectRulesPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [examName, setExamName] = useState('')
  const [rules, setRules] = useState<SubjectRule[]>([])
  const [loading, setLoading] = useState(true)
  const [masterSubjects, setMasterSubjects] = useState<{ name: string, code: string }[]>([])
  const [processing, setProcessing] = useState(false)

  const [classAssignments, setClassAssignments] = useState<any[]>([])
  const [showClassAssignment, setShowClassAssignment] = useState(false)
  const [classAssignmentForm, setClassAssignmentForm] = useState({ subject_code: '', class: '', is_fourth_subject: false, exclude_from_rank: false })

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
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
    classes: initialClasses()
  })

  useEffect(() => {
    loadData()
    loadMasterSubjects()
    loadClassAssignments()
  }, [id])


  async function loadMasterSubjects() {
    const { data } = await supabase.from('FMHS_exam_subjects').select('subject_name, subject_code')
    if (data) {
      const unique: Record<string, string> = {}
      data.forEach(s => {
        if (s.subject_name) unique[s.subject_name] = s.subject_code
      })
      setMasterSubjects(Object.entries(unique).map(([name, code]) => ({ name, code })))
    }
  }

  async function loadClassAssignments() {
    const { data, error } = await supabase.from('FMHS_exam_class_subjects').select('*').eq('exam_id', id).order('class', { ascending: true })
    if (error) setStatus('Error: ' + error.message)
    else setClassAssignments(data || [])
  }


  async function loadData() {
    setLoading(true)
    const { data: examData } = await supabase.from('FMHS_exams_names').select('exam_name').eq('id', id).single()
    if (examData) setExamName(examData.exam_name)
    const { data, error } = await supabase.from('FMHS_exam_subjects').select('*').eq('exam_id', id).order('subject_code', { ascending: true })
    if (error) setStatus('Error: ' + error.message)
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
    if (!newSub.subject_code || !newSub.subject_name) return
    setProcessing(true)
    setStatus(editId ? 'Updating subject...' : 'Creating subject...')

    const payload = { ...newSub, exam_id: id, exam_class: [] as any[] }
    const classesData = newSub.classes
    delete (payload as any).classes

    // Format classes for the JSONB column
    payload.exam_class = classesData.filter(c => c.selected).map(c => ({
      class: c.class,
      is_fourth_subject: c.is_fourth_subject,
      exclude_from_rank: c.exclude_from_rank
    }))

    const { error } = editId
      ? await supabase.from('FMHS_exam_subjects').update(payload).eq('id', editId)
      : await supabase.from('FMHS_exam_subjects').insert([payload])

    if (error) { alert(error.message); setProcessing(false); return }

    if (!editId) await addColumnsToTable(newSub)

    setStatus(editId ? '✅ Subject updated!' : '✅ Subject created!')
    setProcessing(false)
    setEditId(null)
    setIsModalOpen(false)
    loadData()
    setNewSub({ subject_code: '', subject_name: '', full_marks: 100, pass_cq: 0, pass_mcq: 0, pass_practical: 0, pass_total: 33, total_cq: 70, total_mcq: 30, total_practical: 0, classes: initialClasses() })
    loadMasterSubjects() // Refresh list
  }

  function openAddModal() {
    setEditId(null)
    setNewSub({ subject_code: '', subject_name: '', full_marks: 100, pass_cq: 0, pass_mcq: 0, pass_practical: 0, pass_total: 33, total_cq: 70, total_mcq: 30, total_practical: 0, classes: initialClasses() })
    setIsModalOpen(true)
  }

  function editRule(r: SubjectRule) {
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
      classes: [6, 7, 8, 9, 10, 11, 12].map(c => {
        const a = (r.exam_class || []).find((x: any) => x.class === c);
        if (a) return { class: c, selected: true, is_fourth_subject: a.is_fourth_subject, exclude_from_rank: a.exclude_from_rank };
        return { class: c, selected: false, is_fourth_subject: false, exclude_from_rank: false };
      })
    })
    setIsModalOpen(true)
  }

  async function addColumnsToTable(sub: typeof newSub) {
    const base = `*${sub.subject_name.trim()}`
    const cols: string[] = []
    if (sub.total_cq > 0) cols.push(`add column if not exists "${base}_CQ" numeric`)
    if (sub.total_mcq > 0) cols.push(`add column if not exists "${base}_MCQ" numeric`)
    if (sub.total_practical > 0) cols.push(`add column if not exists "${base}_Practical" numeric`)
    cols.push(`add column if not exists "${base}_Total" numeric`)
    cols.push(`add column if not exists "${base}_GPA" text`)
    for (const sql of cols) { await supabase.rpc('execute_sql', { query: `alter table fmhs_exam_data ${sql}` }) }
  }

  async function deleteRule(rid: number, name: string) {
    if (!confirm(`Remove "${name}"?`)) return
    const { error } = await supabase.from('FMHS_exam_subjects').delete().eq('id', rid)
    if (error) alert(error.message)
    else loadData()
  }

  // ─── Class-Subject Assignment CRUD ────────────────────────────────────────
  async function saveClassAssignment() {
    if (!classAssignmentForm.subject_code || !classAssignmentForm.class) {
      setStatus('⚠️ Subject code and class are required')
      return
    }
    setProcessing(true)
    const payload = {
      exam_id: Number(id),
      subject_code: classAssignmentForm.subject_code,
      class: Number(classAssignmentForm.class),
      is_fourth_subject: classAssignmentForm.is_fourth_subject,
      exclude_from_rank: classAssignmentForm.exclude_from_rank,
    }
    const { error } = await supabase.from('FMHS_exam_class_subjects').insert([payload])
    if (error) { setStatus('Error: ' + error.message); setProcessing(false); return }
    setStatus('✅ Class-subject assignment added')
    setClassAssignmentForm({ subject_code: '', class: '', is_fourth_subject: false, exclude_from_rank: false })
    setProcessing(false)
    loadClassAssignments()
  }

  async function updateClassAssignment(assignId: number, field: 'is_fourth_subject' | 'exclude_from_rank', value: boolean) {
    const { error } = await supabase.from('FMHS_exam_class_subjects').update({ [field]: value }).eq('id', assignId)
    if (error) { setStatus('Error: ' + error.message); return }
    setClassAssignments(prev => prev.map(a => a.id === assignId ? { ...a, [field]: value } : a))
  }

  async function deleteClassAssignment(assignId: number) {
    if (!confirm('Remove this class-subject assignment?')) return
    const { error } = await supabase.from('FMHS_exam_class_subjects').delete().eq('id', assignId)
    if (error) setStatus('Error: ' + error.message)
    else loadClassAssignments()
  }

  async function autoAssignAllClasses() {
    if (!confirm('Auto-assign all subjects to classes 6–12? This will create assignments for every subject in every class. You can then toggle 4th subject / exclude from rank per class.')) return
    setProcessing(true)
    setStatus('Auto-assigning...')
    const classes = [6, 7, 8, 9, 10, 11, 12]
    const rows: { exam_id: number; subject_code: string; class: number; is_fourth_subject: boolean; exclude_from_rank: boolean }[] = []
    for (const rule of rules) {
      for (const cls of classes) {
        const existing = classAssignments.find(a => a.subject_code === rule.subject_code && a.class === cls)
        if (!existing) {
          rows.push({
            exam_id: Number(id),
            subject_code: rule.subject_code,
            class: cls,
            is_fourth_subject: false,
            exclude_from_rank: false,
          })
        }
      }
    }
    if (rows.length === 0) { setStatus('All assignments already exist'); setProcessing(false); return }
    const { error } = await supabase.from('FMHS_exam_class_subjects').insert(rows)
    if (error) { setStatus('Error: ' + error.message); setProcessing(false); return }
    setStatus(`✅ Created ${rows.length} class-subject assignments`)
    setProcessing(false)
    loadClassAssignments()
  }

  if (loading) return <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#1e293b', fontFamily: "'Outfit', sans-serif" }}>
      <header style={{ background: '#fff', padding: '20px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={() => navigate(`/exam-panel/${id}`)} style={{ background: '#f1f5f9', border: 'none', color: '#64748b', borderRadius: '12px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}>← Back</button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900 }}>Subject Rules</h1>
            <p style={{ margin: 0, fontSize: '11px', color: '#4f46e5', fontWeight: 800 }}>{examName.toUpperCase()}</p>
          </div>
        </div>
        <button onClick={openAddModal} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '14px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.2)' }}>+ Add Subject</button>
      </header>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ background: '#fff', padding: '32px', borderRadius: '32px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.03)' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Subject Configuration List
            <span style={{ fontSize: '12px', background: '#4f46e5', padding: '6px 16px', borderRadius: '20px', color: '#fff' }}>{rules.length} Subjects</span>
          </h2>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Code</th>
                  <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Subject Name</th>
                  <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'center' }}>CQ</th>
                  <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'center' }}>MCQ</th>
                  <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'center' }}>Prac</th>
                  <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'center' }}>Pass</th>
                  <th style={{ padding: '12px 20px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id} className="subject-row" style={{ background: '#fff', transition: 'all 0.2s' }}>
                    <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f1f5f9', borderRadius: '16px 0 0 16px' }}>
                      <span style={{ fontWeight: 800, color: '#4f46e5', background: '#eef2ff', padding: '4px 10px', borderRadius: '8px' }}>{r.subject_code}</span>
                    </td>
                    <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', fontWeight: 800, fontSize: '1rem' }}>
                      {r.subject_name}
                    </td>
                    <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: '#1e293b', fontWeight: 800 }}>
                      {r.total_cq}
                      {r.total_cq > 0 && <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>P: {r.pass_cq}</div>}
                    </td>
                    <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: '#1e293b', fontWeight: 800 }}>
                      {r.total_mcq}
                      {r.total_mcq > 0 && <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>P: {r.pass_mcq}</div>}
                    </td>
                    <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', textAlign: 'center', color: '#1e293b', fontWeight: 800 }}>
                      {r.total_practical}
                      {r.total_practical > 0 && <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, marginTop: '2px' }}>P: {r.pass_practical}</div>}
                    </td>
                    <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                      <span style={{ background: '#f0fdf4', color: '#166534', padding: '4px 12px', borderRadius: '8px', fontWeight: 800, fontSize: '12px', display: 'block' }}>
                        {r.pass_total}
                        <div style={{ fontSize: '9px', opacity: 0.7, fontWeight: 600 }}>TOTAL PASS</div>
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', borderRadius: '0 16px 16px 0', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button onClick={() => editRule(r)} style={{ background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer', transition: '0.2s' }}>✏️</button>
                        <button onClick={() => deleteRule(r.id, r.subject_name)} style={{ background: '#fff1f2', border: 'none', padding: '8px', borderRadius: '10px', cursor: 'pointer', transition: '0.2s' }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rules.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>📚</div>
              <p>No subjects configured yet. Click "Add Subject" to start.</p>
            </div>
          )}
        </div>

        {/* ─── Class-Subject Assignment Section ──────────────────────────── */}
        <div style={{ background: '#fff', padding: '32px', borderRadius: '32px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.03)', marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '10px' }}>
              🏫 Class-Subject Assignment
              <span style={{ fontSize: '12px', background: '#10b981', padding: '6px 16px', borderRadius: '20px', color: '#fff' }}>{classAssignments.length}</span>
            </h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={autoAssignAllClasses} disabled={processing || rules.length === 0} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>
                ⚡ Auto-Assign 6–12
              </button>
              <button onClick={() => setShowClassAssignment(!showClassAssignment)} style={{ background: showClassAssignment ? '#ef4444' : '#4f46e5', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>
                {showClassAssignment ? '✕ Close' : '+ Add Assignment'}
              </button>
            </div>
          </div>

          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px', lineHeight: 1.6 }}>
            প্রতিটি ক্লাসে কোন কোন বিষয় আছে তা নির্ধারণ করুন। <strong>৪র্থ বিষয়</strong> (৯-১২ ক্লাস): GPA থেকে ২ বিয়োগ হবে এবং অনুপস্থিত গণনায় ধরা হবে না। <strong>Rank থেকে বাদ</strong> (৬-৮ ক্লাস): র‍্যাঙ্ক ক্যালকুলেশনে এই বিষয়ের মার্ক গণনা হবে না।
          </p>

          {/* Add Assignment Form */}
          {showClassAssignment && (
            <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>Subject Code</label>
                  <select value={classAssignmentForm.subject_code} onChange={e => setClassAssignmentForm(p => ({ ...p, subject_code: e.target.value }))} style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, minWidth: '160px' }}>
                    <option value="">Select subject…</option>
                    {rules.map(r => <option key={r.subject_code} value={r.subject_code}>{r.subject_code} – {r.subject_name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>Class</label>
                  <select value={classAssignmentForm.class} onChange={e => setClassAssignmentForm(p => ({ ...p, class: e.target.value }))} style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '13px', fontWeight: 600, minWidth: '80px' }}>
                    <option value="">Class</option>
                    {[6,7,8,9,10,11,12].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#92400e', cursor: 'pointer' }}>
                  <input type="checkbox" checked={classAssignmentForm.is_fourth_subject} onChange={e => setClassAssignmentForm(p => ({ ...p, is_fourth_subject: e.target.checked }))} />
                  ৪র্থ বিষয়
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#dc2626', cursor: 'pointer' }}>
                  <input type="checkbox" checked={classAssignmentForm.exclude_from_rank} onChange={e => setClassAssignmentForm(p => ({ ...p, exclude_from_rank: e.target.checked }))} />
                  Rank থেকে বাদ
                </label>
                <button onClick={saveClassAssignment} disabled={processing} style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>
                  {processing ? '…' : '➕ Add'}
                </button>
              </div>
            </div>
          )}

          {/* Assignments Table */}
          {classAssignments.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '8px 12px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'left' }}>Class</th>
                    <th style={{ padding: '8px 12px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'left' }}>Subject Code</th>
                    <th style={{ padding: '8px 12px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'left' }}>Subject Name</th>
                    <th style={{ padding: '8px 12px', fontSize: '11px', color: '#92400e', fontWeight: 800, textTransform: 'uppercase', textAlign: 'center' }}>৪র্থ বিষয়</th>
                    <th style={{ padding: '8px 12px', fontSize: '11px', color: '#dc2626', fontWeight: 800, textTransform: 'uppercase', textAlign: 'center' }}>Rank থেকে বাদ</th>
                    <th style={{ padding: '8px 12px', fontSize: '11px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {classAssignments.map(a => {
                    const rule = rules.find(r => r.subject_code === a.subject_code)
                    return (
                      <tr key={a.id} style={{ background: '#fff' }}>
                        <td style={{ padding: '10px 12px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f1f5f9', borderRadius: '10px 0 0 10px', fontWeight: 800 }}>
                          <span style={{ background: '#eef2ff', color: '#4f46e5', padding: '3px 10px', borderRadius: '6px', fontSize: '12px' }}>Class {a.class}</span>
                        </td>
                        <td style={{ padding: '10px 12px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#4f46e5' }}>{a.subject_code}</td>
                        <td style={{ padding: '10px 12px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', fontWeight: 600 }}>{rule?.subject_name ?? '—'}</td>
                        <td style={{ padding: '10px 12px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                          <input type="checkbox" checked={a.is_fourth_subject} onChange={e => updateClassAssignment(a.id, 'is_fourth_subject', e.target.checked)} style={{ cursor: 'pointer', accentColor: '#f59e0b', width: '16px', height: '16px' }} />
                        </td>
                        <td style={{ padding: '10px 12px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                          <input type="checkbox" checked={a.exclude_from_rank} onChange={e => updateClassAssignment(a.id, 'exclude_from_rank', e.target.checked)} style={{ cursor: 'pointer', accentColor: '#ef4444', width: '16px', height: '16px' }} />
                        </td>
                        <td style={{ padding: '10px 12px', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', borderRadius: '0 10px 10px 0', textAlign: 'right' }}>
                          <button onClick={() => deleteClassAssignment(a.id)} style={{ background: '#fff1f2', border: 'none', padding: '6px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>🗑️</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {classAssignments.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏫</div>
              <p style={{ fontSize: '13px' }}>No class-subject assignments yet. Use "Auto-Assign 6–12" or add manually.</p>
            </div>
          )}
        </div>
      </main>

      {/* Modal Overlay */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }} onClick={() => setIsModalOpen(false)}>
          <div style={{ background: '#fff', borderRadius: '24px', padding: '32px', width: '90%', maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0,0,0,0.05)', position: 'relative', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 900, margin: 0, color: '#0f172a' }}>{editId ? '📝 Edit Subject' : '✨ Add New Subject'}</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>Configure marks and rules for this subject</p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s', color: '#64748b' }}>✕</button>
            </div>

            <form onSubmit={saveSubject}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '20px' }}>
                <div className="form-group">
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Code</label>
                  <input className="form-control" style={{ borderRadius: '12px', padding: '10px 14px', fontSize: '0.95rem', fontWeight: 700 }} value={newSub.subject_code} onChange={e => setNewSub({ ...newSub, subject_code: e.target.value })} required placeholder="e.g. 101" />
                </div>
                <div className="form-group">
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject Name</label>
                  <input
                    list="master-subjects"
                    className="form-control"
                    style={{ borderRadius: '12px', padding: '10px 14px', fontSize: '0.95rem', fontWeight: 700 }}
                    value={newSub.subject_name}
                    onChange={e => handleSubjectNameChange(e.target.value)}
                    required
                    placeholder="Search or type name..."
                  />
                  <datalist id="master-subjects">
                    {masterSubjects.map(s => (
                      <option key={s.name} value={s.name}>{s.code}</option>
                    ))}
                  </datalist>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                {/* Left Column: Marks & Pass Distribution */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h4 style={{ margin: 0, fontSize: '11px', color: '#4f46e5', fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase' }}>📊 Marks Distribution</h4>
                    <span style={{ fontSize: '10px', background: '#eef2ff', color: '#4f46e5', padding: '4px 10px', borderRadius: '12px', fontWeight: 800 }}>
                      Total: {newSub.total_cq + newSub.total_mcq + newSub.total_practical}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    {/* CQ Section */}
                    <div style={{ background: '#fff', padding: '10px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 800, color: '#64748b', marginBottom: '6px', textAlign: 'center' }}>CQ</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div>
                          <input type="number" className="form-control" style={{ borderRadius: '8px', textAlign: 'center', fontWeight: 700, padding: '6px', fontSize: '11px' }} value={newSub.total_cq} onChange={e => setNewSub({ ...newSub, total_cq: Number(e.target.value) })} title="CQ Full Marks" placeholder="FULL" />
                        </div>
                        <div>
                          <input type="number" className="form-control" style={{ borderRadius: '8px', textAlign: 'center', fontWeight: 700, padding: '6px', fontSize: '11px', border: '1px solid #fecaca', background: '#fff1f2' }} value={newSub.pass_cq} onChange={e => setNewSub({ ...newSub, pass_cq: Number(e.target.value) })} title="CQ Pass Marks" placeholder="PASS" />
                        </div>
                      </div>
                    </div>

                    {/* MCQ Section */}
                    <div style={{ background: '#fff', padding: '10px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 800, color: '#64748b', marginBottom: '6px', textAlign: 'center' }}>MCQ</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div>
                          <input type="number" className="form-control" style={{ borderRadius: '8px', textAlign: 'center', fontWeight: 700, padding: '6px', fontSize: '11px' }} value={newSub.total_mcq} onChange={e => setNewSub({ ...newSub, total_mcq: Number(e.target.value) })} title="MCQ Full Marks" placeholder="FULL" />
                        </div>
                        <div>
                          <input type="number" className="form-control" style={{ borderRadius: '8px', textAlign: 'center', fontWeight: 700, padding: '6px', fontSize: '11px', border: '1px solid #fecaca', background: '#fff1f2' }} value={newSub.pass_mcq} onChange={e => setNewSub({ ...newSub, pass_mcq: Number(e.target.value) })} title="MCQ Pass Marks" placeholder="PASS" />
                        </div>
                      </div>
                    </div>

                    {/* PRAC Section */}
                    <div style={{ background: '#fff', padding: '10px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                      <label style={{ display: 'block', fontSize: '9px', fontWeight: 800, color: '#64748b', marginBottom: '6px', textAlign: 'center' }}>PRAC</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div>
                          <input type="number" className="form-control" style={{ borderRadius: '8px', textAlign: 'center', fontWeight: 700, padding: '6px', fontSize: '11px' }} value={newSub.total_practical} onChange={e => setNewSub({ ...newSub, total_practical: Number(e.target.value) })} title="Practical Full Marks" placeholder="FULL" />
                        </div>
                        <div>
                          <input type="number" className="form-control" style={{ borderRadius: '8px', textAlign: 'center', fontWeight: 700, padding: '6px', fontSize: '11px', border: '1px solid #fecaca', background: '#fff1f2' }} value={newSub.pass_practical} onChange={e => setNewSub({ ...newSub, pass_practical: Number(e.target.value) })} title="Practical Pass Marks" placeholder="PASS" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: '#fff9eb', padding: '12px', borderRadius: '12px', border: '1px solid #fef3c7', marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: '#fcd34d', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🎯</div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#92400e', marginBottom: '2px', textTransform: 'uppercase' }}>Passing Threshold</label>
                      <input type="number" className="form-control" style={{ borderRadius: '8px', border: '2px solid #fcd34d', fontWeight: 800, fontSize: '13px', padding: '6px 10px' }} value={newSub.pass_total} onChange={e => setNewSub({ ...newSub, pass_total: Number(e.target.value) })} />
                    </div>
                  </div>
                </div>

                {/* Right Column: Class Assignments */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '11px', color: '#4f46e5', fontWeight: 900, letterSpacing: '0.05em', textTransform: 'uppercase' }}>🏫 Class Assignments</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
                    {newSub.classes.map((cls, idx) => (
                      <div key={cls.class} style={{ background: cls.selected ? '#eef2ff' : '#fff', border: `1px solid ${cls.selected ? '#c7d2fe' : '#e2e8f0'}`, borderRadius: '10px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px', transition: 'all 0.2s' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 800, color: cls.selected ? '#4f46e5' : '#475569', fontSize: '13px', margin: 0 }}>
                          <input type="checkbox" checked={cls.selected} onChange={e => {
                            const newClasses = [...newSub.classes];
                            newClasses[idx].selected = e.target.checked;
                            setNewSub({ ...newSub, classes: newClasses });
                          }} style={{ width: '14px', height: '14px', accentColor: '#4f46e5' }} />
                          Class {cls.class}
                        </label>
                        {cls.selected && (
                          <div style={{ display: 'flex', gap: '12px', marginLeft: '22px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 700, color: '#92400e', cursor: 'pointer', margin: 0 }}>
                              <input type="checkbox" checked={cls.is_fourth_subject} onChange={e => {
                                const newClasses = [...newSub.classes];
                                newClasses[idx].is_fourth_subject = e.target.checked;
                                setNewSub({ ...newSub, classes: newClasses });
                              }} style={{ accentColor: '#f59e0b' }} />
                              4th Subject (GPA -2)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 700, color: '#dc2626', cursor: 'pointer', margin: 0 }}>
                              <input type="checkbox" checked={cls.exclude_from_rank} onChange={e => {
                                const newClasses = [...newSub.classes];
                                newClasses[idx].exclude_from_rank = e.target.checked;
                                setNewSub({ ...newSub, classes: newClasses });
                              }} style={{ accentColor: '#ef4444' }} />
                              Exclude from Rank
                            </label>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '20px', background: '#f1f5f9', border: 'none', fontWeight: 800, cursor: 'pointer', color: '#64748b', fontSize: '14px', transition: '0.2s' }}>CANCEL</button>
                <button className="btn btn-primary" disabled={processing} style={{ flex: 2, padding: '16px', borderRadius: '20px', background: '#4f46e5', border: 'none', fontWeight: 800, color: '#fff', fontSize: '14px', boxShadow: '0 10px 20px -5px rgba(79, 70, 229, 0.4)', cursor: 'pointer', transition: '0.2s' }}>
                  {processing ? 'SAVING...' : (editId ? 'UPDATE SUBJECT' : 'CREATE SUBJECT')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .form-control:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
        }
      `}</style>
    </div>
  )
}

