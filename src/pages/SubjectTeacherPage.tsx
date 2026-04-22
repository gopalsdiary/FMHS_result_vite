import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import PageShell from '@/components/PageShell'

interface SubjectAssignment { subject_code: number; teacher_email_id: string; subject_name: string; class: string; section: string }

export default function SubjectTeacherPage() {
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState<SubjectAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [form, setForm] = useState({ teacher_email_id: '', subject_name: '', class: '', section: '' })
  const [editId, setEditId] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      load()
    })
  }, [navigate])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('subject_selection').select('*').order('class').order('section')
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    setAssignments((data ?? []) as SubjectAssignment[])
    setLoading(false)
  }

  async function save() {
    const { error } = editId
      ? await supabase.from('subject_selection').update(form).eq('subject_code', editId)
      : await supabase.from('subject_selection').insert(form)
    if (error) { setStatus('Error: ' + error.message); return }
    setStatus(editId ? 'Updated' : 'Added'); setEditId(null)
    setForm({ teacher_email_id: '', subject_name: '', class: '', section: '' })
    load()
  }

  async function del(id: number) {
    if (!confirm('Remove this assignment?')) return
    const { error } = await supabase.from('subject_selection').delete().eq('subject_code', id)
    if (error) setStatus('Error: ' + error.message)
    else load()
  }

  return (
    <PageShell title="Subject-Teacher Assignment">
      {() => (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>{editId ? 'Edit Assignment' : 'Add Assignment'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div><label>Teacher Email</label><input type="email" value={form.teacher_email_id} onChange={e => setForm(p => ({ ...p, teacher_email_id: e.target.value }))} style={{ minWidth: '220px' }} /></div>
              <div><label>Subject</label><input type="text" value={form.subject_name} onChange={e => setForm(p => ({ ...p, subject_name: e.target.value }))} style={{ minWidth: '160px' }} /></div>
              <div><label>Class</label><input type="text" value={form.class} onChange={e => setForm(p => ({ ...p, class: e.target.value }))} style={{ width: '80px' }} /></div>
              <div><label>Section</label><input type="text" value={form.section} onChange={e => setForm(p => ({ ...p, section: e.target.value }))} style={{ width: '80px' }} /></div>
              <button className="btn btn-success" onClick={save}>{editId ? '💾 Update' : '➕ Assign'}</button>
              {editId && <button className="btn btn-secondary" onClick={() => { setEditId(null); setForm({ teacher_email_id: '', subject_name: '', class: '', section: '' }) }}>Cancel</button>}
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '10px' }}>{status}</div>}
          </div>

          {loading && <div className="spinner" />}

          {!loading && (
            <div className="card table-responsive">
              <table>
                <thead>
                  <tr><th>Teacher Email</th><th>Subject</th><th>Class</th><th>Section</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {assignments.map(a => (
                    <tr key={a.subject_code}>
                      <td>{a.teacher_email_id}</td>
                      <td>{a.subject_name}</td>
                      <td style={{ textAlign: 'center' }}>{a.class}</td>
                      <td style={{ textAlign: 'center' }}>{a.section}</td>
                      <td>
                        <button onClick={() => { setEditId(a.subject_code); setForm({ teacher_email_id: a.teacher_email_id, subject_name: a.subject_name, class: a.class, section: a.section }) }} style={{ fontSize: '11px', padding: '3px 8px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '4px' }}>Edit</button>
                        <button onClick={() => del(a.subject_code)} style={{ fontSize: '11px', padding: '3px 8px', background: '#d73a49', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Remove</button>
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
