import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import PageShell from '@/components/PageShell'

interface Teacher { id: number; name: string; email: string; phone?: string; subject?: string; class?: string }

export default function TeacherSetupPage() {
  const navigate = useNavigate()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', class: '' })
  const [editId, setEditId] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      load()
    })
  }, [navigate])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('teachers').select('*').order('name')
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    setTeachers((data ?? []) as Teacher[])
    setLoading(false)
  }

  async function save() {
    const { error } = editId
      ? await supabase.from('teachers').update(form).eq('id', editId)
      : await supabase.from('teachers').insert(form)
    if (error) { setStatus('Error: ' + error.message); return }
    setStatus(editId ? 'Updated' : 'Added teacher'); setEditId(null)
    setForm({ name: '', email: '', phone: '', subject: '', class: '' })
    load()
  }

  async function del(id: number) {
    if (!confirm('Delete this teacher?')) return
    const { error } = await supabase.from('teachers').delete().eq('id', id)
    if (error) setStatus('Error: ' + error.message)
    else load()
  }

  return (
    <PageShell title="Teacher Setup">
      {() => (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>{editId ? 'Edit Teacher' : 'Add Teacher'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div><label>Name</label><input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={{ minWidth: '180px' }} /></div>
              <div><label>Email</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} style={{ minWidth: '220px' }} /></div>
              <div><label>Phone</label><input type="text" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} style={{ width: '130px' }} /></div>
              <div><label>Subject</label><input type="text" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} style={{ minWidth: '150px' }} /></div>
              <div><label>Class</label><input type="text" value={form.class} onChange={e => setForm(p => ({ ...p, class: e.target.value }))} style={{ width: '80px' }} /></div>
              <button className="btn btn-success" onClick={save}>{editId ? '💾 Update' : '➕ Add'}</button>
              {editId && <button className="btn btn-secondary" onClick={() => { setEditId(null); setForm({ name: '', email: '', phone: '', subject: '', class: '' }) }}>Cancel</button>}
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '10px' }}>{status}</div>}
          </div>

          {loading && <div className="spinner" />}

          {!loading && (
            <div className="card table-responsive">
              <table>
                <thead>
                  <tr><th>#</th><th>Name</th><th>Email</th><th>Phone</th><th>Subject</th><th>Class</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {teachers.map((t, i) => (
                    <tr key={t.id}>
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{t.name}</td>
                      <td>{t.email}</td>
                      <td>{t.phone ?? '—'}</td>
                      <td>{t.subject ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>{t.class ?? '—'}</td>
                      <td>
                        <button onClick={() => { setEditId(t.id); setForm({ name: t.name, email: t.email, phone: t.phone ?? '', subject: t.subject ?? '', class: t.class ?? '' }) }} style={{ fontSize: '11px', padding: '3px 8px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '4px' }}>Edit</button>
                        <button onClick={() => del(t.id)} style={{ fontSize: '11px', padding: '3px 8px', background: '#d73a49', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
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
