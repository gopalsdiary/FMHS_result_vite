import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'

interface GradeRule { id: number; subject: string; min_score: number; max_score: number; grade: string; gpa: number }

const STORAGE_KEY = 'fmhs-grade-criteria'

const defaultRules: GradeRule[] = [
  { id: 1, subject: 'All', min_score: 80, max_score: 100, grade: 'A+', gpa: 5 },
  { id: 2, subject: 'All', min_score: 70, max_score: 79, grade: 'A', gpa: 4 },
  { id: 3, subject: 'All', min_score: 60, max_score: 69, grade: 'A-', gpa: 3.5 },
  { id: 4, subject: 'All', min_score: 50, max_score: 59, grade: 'B', gpa: 3 },
  { id: 5, subject: 'All', min_score: 40, max_score: 49, grade: 'C', gpa: 2 },
  { id: 6, subject: 'All', min_score: 33, max_score: 39, grade: 'D', gpa: 1 },
]

function readRules(): GradeRule[] {
  if (typeof window === 'undefined') return defaultRules
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return defaultRules
  try {
    const parsed = JSON.parse(raw) as GradeRule[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultRules
  } catch {
    return defaultRules
  }
}

export default function GradeManagementPage() {
  const navigate = useNavigate()
  const [grades, setGrades] = useState<GradeRule[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [form, setForm] = useState({ subject: '', min_score: '', max_score: '', grade: '', gpa: '' })
  const [editId, setEditId] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      loadGrades()
    })
  }, [navigate])

  function loadGrades() {
    setLoading(true)
    const rules = readRules().sort((left, right) => right.gpa - left.gpa)
    setGrades(rules)
    setLoading(false)
    setStatus('Loaded from browser storage')
  }

  function persistRules(nextRules: GradeRule[]) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRules))
    setGrades(nextRules.sort((left, right) => right.gpa - left.gpa))
  }

  function save() {
    const payload = { subject: form.subject.trim() || 'All', min_score: Number(form.min_score), max_score: Number(form.max_score), grade: form.grade.trim(), gpa: Number(form.gpa) }
    if (!payload.grade || Number.isNaN(payload.min_score) || Number.isNaN(payload.max_score) || Number.isNaN(payload.gpa)) {
      setStatus('Please fill all fields with valid values')
      return
    }

    const nextRules = [...grades]
    if (editId) {
      const index = nextRules.findIndex(rule => rule.id === editId)
      if (index >= 0) nextRules[index] = { id: editId, ...payload }
    } else {
      nextRules.push({ id: Date.now(), ...payload })
    }

    persistRules(nextRules)
    setStatus(editId ? 'Updated' : 'Added')
    setForm({ subject: '', min_score: '', max_score: '', grade: '', gpa: '' })
    setEditId(null)
  }

  function deleteGrade(id: number) {
    if (!confirm('Delete this grade rule?')) return
    const nextRules = grades.filter(rule => rule.id !== id)
    persistRules(nextRules)
    setStatus('Deleted')
  }

  function startEdit(g: GradeRule) {
    setEditId(g.id)
    setForm({ subject: g.subject, min_score: String(g.min_score), max_score: String(g.max_score), grade: g.grade, gpa: String(g.gpa) })
  }

  return (
    <PageShell title="Grade Management">
      {() => (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: '20px', background: '#fff8e1', border: '1px solid #f9a825' }}>
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>Local grade criteria</div>
            <div style={{ fontSize: '14px', color: '#5d4037' }}>
              This page now stores rules in browser localStorage because the Supabase table <strong>grade_criteria</strong> is not available in this project.
            </div>
          </div>

          {/* Form */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>{editId ? 'Edit Grade Rule' : 'Add Grade Rule'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div><label>Subject</label><input type="text" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} placeholder="All or subject name" style={{ width: '160px' }} /></div>
              <div><label>Min Score</label><input type="number" value={form.min_score} onChange={e => setForm(p => ({ ...p, min_score: e.target.value }))} style={{ width: '90px' }} /></div>
              <div><label>Max Score</label><input type="number" value={form.max_score} onChange={e => setForm(p => ({ ...p, max_score: e.target.value }))} style={{ width: '90px' }} /></div>
              <div><label>Grade</label><input type="text" value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))} style={{ width: '70px' }} /></div>
              <div><label>GPA</label><input type="number" value={form.gpa} onChange={e => setForm(p => ({ ...p, gpa: e.target.value }))} step="0.5" style={{ width: '70px' }} /></div>
              <button className="btn btn-success" onClick={save}>{editId ? '💾 Update' : '➕ Add'}</button>
              {editId && <button className="btn btn-secondary" onClick={() => { setEditId(null); setForm({ subject: '', min_score: '', max_score: '', grade: '', gpa: '' }) }}>Cancel</button>}
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '10px' }}>{status}</div>}
          </div>

          {loading && <div className="spinner" />}

          {!loading && (
            <div className="card table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Subject</th><th>Min Score</th><th>Max Score</th><th>Grade</th><th>GPA</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {grades.map(g => (
                    <tr key={g.id}>
                      <td>{g.subject}</td>
                      <td style={{ textAlign: 'center' }}>{g.min_score}</td>
                      <td style={{ textAlign: 'center' }}>{g.max_score}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{g.grade}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{g.gpa}</td>
                      <td>
                        <button onClick={() => startEdit(g)} style={{ fontSize: '11px', padding: '3px 8px', marginRight: '6px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => deleteGrade(g.id)} style={{ fontSize: '11px', padding: '3px 8px', background: '#d73a49', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
                      </td>
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

