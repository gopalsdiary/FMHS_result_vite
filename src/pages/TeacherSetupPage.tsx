import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import PageShell from '@/components/PageShell'

interface SubjectEntry {
  subject_code: number
  subject_name: string | null
  class: number | null
  section: string | null
  teacher_email_id: string | null
  teacher_name_en: string | null
  comment: string | null
}

const emptyForm = { subject_name: '', class: '', section: '', teacher_email_id: '', teacher_name_en: '', comment: '' }

export default function TeacherSetupPage() {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<SubjectEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { navigate('/login', { replace: true }); return }
      load()
    })
  }, [navigate])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('subject_selection')
      .select('*')
      .order('class')
      .order('section')
    if (error) { setStatus('Error: ' + error.message); setLoading(false); return }
    setEntries((data ?? []) as SubjectEntry[])
    setLoading(false)
  }

  async function save() {
    const payload = {
      subject_name: form.subject_name,
      class: form.class ? Number(form.class) : null,
      section: form.section,
      teacher_email_id: form.teacher_email_id,
      teacher_name_en: form.teacher_name_en,
      comment: form.comment,
    }
    const { error } = editId
      ? await supabase.from('subject_selection').update(payload).eq('subject_code', editId)
      : await supabase.from('subject_selection').insert(payload)
    if (error) { setStatus('Error: ' + error.message); return }
    setStatus(editId ? '✅ Updated' : '✅ Added'); setEditId(null)
    setForm(emptyForm)
    load()
  }

  async function del(id: number) {
    if (!confirm('Delete this entry?')) return
    const { error } = await supabase.from('subject_selection').delete().eq('subject_code', id)
    if (error) setStatus('Error: ' + error.message)
    else { setStatus('Deleted'); load() }
  }

  function startEdit(e: SubjectEntry) {
    setEditId(e.subject_code)
    setForm({
      subject_name: e.subject_name ?? '',
      class: e.class != null ? String(e.class) : '',
      section: e.section ?? '',
      teacher_email_id: e.teacher_email_id ?? '',
      teacher_name_en: e.teacher_name_en ?? '',
      comment: e.comment ?? '',
    })
  }

  return (
    <PageShell title="Teacher Setup">
      {() => (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div className="card" style={{ marginBottom: '20px' }}>
            <div style={{ fontWeight: 600, marginBottom: '12px' }}>{editId ? 'Edit Entry' : 'Add New Subject–Teacher'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
              <div><label>Class</label><input type="number" value={form.class} onChange={e => setForm(p => ({ ...p, class: e.target.value }))} style={{ width: '70px' }} /></div>
              <div><label>Section</label><input type="text" value={form.section} onChange={e => setForm(p => ({ ...p, section: e.target.value }))} style={{ width: '80px' }} /></div>
              <div><label>Subject</label><input type="text" value={form.subject_name} onChange={e => setForm(p => ({ ...p, subject_name: e.target.value }))} style={{ minWidth: '180px' }} /></div>
              <div><label>Teacher Name</label><input type="text" value={form.teacher_name_en} onChange={e => setForm(p => ({ ...p, teacher_name_en: e.target.value }))} style={{ minWidth: '160px' }} /></div>
              <div><label>Teacher Email</label><input type="email" value={form.teacher_email_id} onChange={e => setForm(p => ({ ...p, teacher_email_id: e.target.value }))} style={{ minWidth: '200px' }} /></div>
              <div><label>Comment</label><input type="text" value={form.comment} onChange={e => setForm(p => ({ ...p, comment: e.target.value }))} style={{ minWidth: '140px' }} /></div>
              <button className="btn btn-success" onClick={save}>{editId ? '💾 Update' : '➕ Add'}</button>
              {editId && <button className="btn btn-secondary" onClick={() => { setEditId(null); setForm(emptyForm) }}>Cancel</button>}
            </div>
            {status && <div className="alert alert-info" style={{ marginTop: '10px' }}>{status}</div>}
          </div>

          {loading && <div className="spinner" />}

          {!loading && (
            <div className="card table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Class</th><th>Section</th><th>Subject</th>
                    <th>Teacher Name</th><th>Teacher Email</th><th>Comment</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.subject_code}>
                      <td>{i + 1}</td>
                      <td style={{ textAlign: 'center' }}>{e.class ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>{e.section ?? '—'}</td>
                      <td style={{ fontWeight: 500 }}>{e.subject_name ?? '—'}</td>
                      <td>{e.teacher_name_en ?? '—'}</td>
                      <td>{e.teacher_email_id ?? '—'}</td>
                      <td>{e.comment ?? '—'}</td>
                      <td>
                        <button onClick={() => startEdit(e)} style={{ fontSize: '11px', padding: '3px 8px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '4px' }}>Edit</button>
                        <button onClick={() => del(e.subject_code)} style={{ fontSize: '11px', padding: '3px 8px', background: '#d73a49', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Delete</button>
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
