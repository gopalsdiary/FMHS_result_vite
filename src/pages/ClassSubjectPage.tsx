import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import PageShell from '@/layout/PageShell'

interface ClassSubjectRow { id: number; class: string; section: string; subject: string; has_cq: boolean; has_mcq: boolean; has_practical: boolean }

export default function ClassSubjectPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ClassSubjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [form, setForm] = useState({ class: '', section: '', subject: '', has_cq: true, has_mcq: true, has_practical: false })
  const [editId, setEditId] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      load()
    })
  }, [navigate])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('class_subject').select('*').order('class').order('section')
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    setRows((data ?? []) as ClassSubjectRow[])
    setLoading(false)
  }

  async function save() {
    const { error } = editId
      ? await supabase.from('class_subject').update(form).eq('id', editId)
      : await supabase.from('class_subject').insert(form)
    if (error) { setStatus('Error: ' + error.message); return }
    setStatus(editId ? 'Updated' : 'Added'); setEditId(null)
    setForm({ class: '', section: '', subject: '', has_cq: true, has_mcq: true, has_practical: false })
    load()
  }

  async function del(id: number) {
    if (!confirm('Delete this entry?')) return
    const { error } = await supabase.from('class_subject').delete().eq('id', id)
    if (error) setStatus('Error: ' + error.message)
    else load()
  }

  return (
    <PageShell title="Class-Subject Configuration">
      {() => (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>{editId ? 'Edit' : 'Add'} Class-Subject</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div><label>Class</label><input type="text" value={form.class} onChange={e => setForm(p => ({ ...p, class: e.target.value }))} style={{ width: '80px' }} /></div>
              <div><label>Section</label><input type="text" value={form.section} onChange={e => setForm(p => ({ ...p, section: e.target.value }))} style={{ width: '80px' }} /></div>
              <div><label>Subject</label><input type="text" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} style={{ minWidth: '180px' }} /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}><input type="checkbox" checked={form.has_cq} onChange={e => setForm(p => ({ ...p, has_cq: e.target.checked }))} /> CQ</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}><input type="checkbox" checked={form.has_mcq} onChange={e => setForm(p => ({ ...p, has_mcq: e.target.checked }))} /> MCQ</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}><input type="checkbox" checked={form.has_practical} onChange={e => setForm(p => ({ ...p, has_practical: e.target.checked }))} /> Practical</label>
              <button className="btn btn-success" onClick={save}>{editId ? '💾 Update' : '➕ Add'}</button>
              {editId && <button className="btn btn-secondary" onClick={() => { setEditId(null); setForm({ class: '', section: '', subject: '', has_cq: true, has_mcq: true, has_practical: false }) }}>Cancel</button>}
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '10px' }}>{status}</div>}
          </div>

          {loading && <div className="spinner" />}

          {!loading && (
            <div className="card table-responsive">
              <table>
                <thead>
                  <tr><th>Class</th><th>Section</th><th>Subject</th><th>CQ</th><th>MCQ</th><th>Practical</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td style={{ textAlign: 'center' }}>{r.class}</td>
                      <td style={{ textAlign: 'center' }}>{r.section}</td>
                      <td>{r.subject}</td>
                      <td style={{ textAlign: 'center' }}>{r.has_cq ? '✅' : '—'}</td>
                      <td style={{ textAlign: 'center' }}>{r.has_mcq ? '✅' : '—'}</td>
                      <td style={{ textAlign: 'center' }}>{r.has_practical ? '✅' : '—'}</td>
                      <td>
                        <button onClick={() => { setEditId(r.id); setForm({ class: r.class, section: r.section, subject: r.subject, has_cq: r.has_cq, has_mcq: r.has_mcq, has_practical: r.has_practical }) }} style={{ fontSize: '11px', padding: '3px 8px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '4px' }}>Edit</button>
                        <button onClick={() => del(r.id)} style={{ fontSize: '11px', padding: '3px 8px', background: '#d73a49', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
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

