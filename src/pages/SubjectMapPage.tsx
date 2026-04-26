import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'

interface SubjectMap { id: number; subject_name: string; column_prefix: string; subject_code: string }

const EMPTY_FORM = { subject_name: '', column_prefix: '', subject_code: '' }

export default function SubjectMapPage() {
  const navigate = useNavigate()
  const [maps, setMaps] = useState<SubjectMap[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [csvText, setCsvText] = useState('')
  const [showCsvImport, setShowCsvImport] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('FMHS_subject_map').select('*').order('subject_name')
    setMaps((data ?? []) as SubjectMap[])
    setLoading(false)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.subject_name || !form.column_prefix) { setStatus('⚠️ বিষয়ের নাম ও কলাম প্রিফিক্স আবশ্যক।'); return }
    const payload = { subject_name: form.subject_name.trim(), column_prefix: form.column_prefix.trim(), subject_code: form.subject_code.trim() }
    const { error } = editId
      ? await supabase.from('FMHS_subject_map').update(payload).eq('id', editId)
      : await supabase.from('FMHS_subject_map').insert(payload)
    if (error) { setStatus('❌ ' + error.message); return }
    setStatus(editId ? '✅ আপডেট হয়েছে।' : '✅ যোগ হয়েছে।')
    setForm(EMPTY_FORM); setEditId(null); load()
  }

  async function del(id: number) {
    if (!confirm('এই বিষয়টি মুছে ফেলবেন?')) return
    await supabase.from('FMHS_subject_map').delete().eq('id', id)
    load()
  }

  async function importCsv() {
    const lines = csvText.trim().split('\n').filter(l => l.trim())
    const rows: { subject_name: string; column_prefix: string; subject_code: string }[] = []
    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim())
      if (parts.length < 2) continue
      rows.push({
        subject_name: parts[0],
        column_prefix: parts[1],
        subject_code: parts[2] ?? '',
      })
    }
    if (rows.length === 0) { setStatus('⚠️ কোনো ভ্যালিড ডাটা পাওয়া যায়নি।'); return }
    const { error } = await supabase.from('FMHS_subject_map').insert(rows)
    if (error) { setStatus('❌ Import failed: ' + error.message); return }
    setStatus(`✅ ${rows.length}টি বিষয় import হয়েছে।`)
    setCsvText(''); setShowCsvImport(false); load()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "'Outfit', sans-serif", color: '#1e293b' }}>
      <header style={{ background: '#fff', padding: '18px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate(-1)} style={{ background: '#f1f5f9', border: 'none', color: '#64748b', borderRadius: '12px', padding: '8px 16px', cursor: 'pointer', fontWeight: 700 }}>← Back</button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900 }}>📋 বিষয় ম্যাপিং</h1>
          <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>fmhs_exam_data-এর কলাম নামের সাথে বিষয়ের নাম ম্যাপ করুন</p>
        </div>
        <button onClick={() => setShowCsvImport(!showCsvImport)} style={{ marginLeft: 'auto', background: '#0f172a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>
          {showCsvImport ? '✕ বন্ধ করুন' : '📥 CSV Import'}
        </button>
      </header>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 20px' }}>

        {/* CSV Import Section */}
        {showCsvImport && (
          <div style={{ background: '#fff', padding: '28px', borderRadius: '24px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 12px', fontWeight: 900, fontSize: '1rem' }}>📥 CSV থেকে Import করুন</h3>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px' }}>
              প্রতিটি লাইনে লিখুন: <code style={{ background: '#f8fafc', padding: '2px 6px', borderRadius: '4px' }}>বিষয়ের নাম, কলাম প্রিফিক্স, বোর্ড কোড</code><br />
              উদাহরণ: <code style={{ background: '#f8fafc', padding: '2px 6px', borderRadius: '4px' }}>Bangla 1st Paper, *Bangla 1st Paper, 101</code>
            </p>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={`Bangla 1st Paper, *Bangla 1st Paper, 101\nBangla 2nd Paper, *Bangla 2nd Paper, 102\nEnglish 1st Paper, *English 1st Paper, 107`}
              rows={8}
              style={{ width: '100%', borderRadius: '12px', border: '1.5px solid #e2e8f0', padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical' }}
            />
            <button onClick={importCsv} style={{ marginTop: '12px', background: '#0f172a', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>
              📥 Import করুন
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>

          {/* Add/Edit Form */}
          <div style={{ background: '#fff', padding: '28px', borderRadius: '24px', border: '1px solid #e2e8f0', height: 'fit-content' }}>
            <h3 style={{ margin: '0 0 20px', fontWeight: 900, fontSize: '1rem' }}>{editId ? '✏️ সম্পাদনা' : '➕ নতুন বিষয় যোগ'}</h3>
            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>বিষয়ের নাম <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inputStyle} value={form.subject_name} onChange={e => setForm(f => ({ ...f, subject_name: e.target.value }))} placeholder="Bangla 1st Paper" required />
              </div>
              <div>
                <label style={labelStyle}>কলাম প্রিফিক্স (fmhs_exam_data) <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={inputStyle} value={form.column_prefix} onChange={e => setForm(f => ({ ...f, column_prefix: e.target.value }))} placeholder="*Bangla 1st Paper" required />
                <p style={{ fontSize: '10px', color: '#94a3b8', margin: '4px 0 0' }}>যেমন: *Bangla 1st Paper_CQ এর প্রিফিক্স হবে "*Bangla 1st Paper"</p>
              </div>
              <div>
                <label style={labelStyle}>বোর্ড কোড</label>
                <input style={inputStyle} value={form.subject_code} onChange={e => setForm(f => ({ ...f, subject_code: e.target.value }))} placeholder="101" />
              </div>
              {status && <div style={{ padding: '8px 12px', background: status.startsWith('❌') ? '#fff1f2' : '#f0fdf4', borderRadius: '10px', fontSize: '12px', fontWeight: 600, color: status.startsWith('❌') ? '#ef4444' : '#166534' }}>{status}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" style={{ flex: 2, padding: '12px', borderRadius: '14px', background: '#4f46e5', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer' }}>
                  {editId ? '💾 আপডেট' : '➕ যোগ করুন'}
                </button>
                {editId && (
                  <button type="button" onClick={() => { setEditId(null); setForm(EMPTY_FORM) }} style={{ flex: 1, padding: '12px', borderRadius: '14px', background: '#f1f5f9', color: '#64748b', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                    বাতিল
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Maps Table */}
          <div style={{ background: '#fff', padding: '28px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 20px', fontWeight: 900, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              📚 সংরক্ষিত বিষয় তালিকা
              <span style={{ fontSize: '12px', background: '#4f46e5', color: '#fff', padding: '4px 12px', borderRadius: '20px' }}>{maps.length}টি</span>
            </h3>
            {loading && <div className="spinner" />}
            {!loading && maps.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>CSV Import বা ম্যানুয়ালি বিষয় যোগ করুন।</div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={thStyle}>বিষয়ের নাম</th>
                    <th style={thStyle}>কলাম প্রিফিক্স</th>
                    <th style={thStyle}>কোড</th>
                    <th style={thStyle}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {maps.map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={tdStyle}><span style={{ fontWeight: 700 }}>{m.subject_name}</span></td>
                      <td style={tdStyle}><code style={{ background: '#f8fafc', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>{m.column_prefix}</code></td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {m.subject_code ? <span style={{ background: '#eef2ff', color: '#4f46e5', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '11px' }}>{m.subject_code}</span> : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button onClick={() => { setEditId(m.id); setForm({ subject_name: m.subject_name, column_prefix: m.column_prefix, subject_code: m.subject_code ?? '' }) }} style={actionBtn('#eef2ff', '#4f46e5')}>✏️</button>
                          <button onClick={() => del(m.id)} style={actionBtn('#fff1f2', '#ef4444')}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '10px', fontWeight: 800, color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: '12px', border: '1.5px solid #e2e8f0', fontSize: '13px', fontWeight: 600, background: '#f8fafc', outline: 'none', boxSizing: 'border-box', fontFamily: "'Outfit', sans-serif" }
const thStyle: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: '10px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0' }
const tdStyle: React.CSSProperties = { padding: '12px 16px', verticalAlign: 'middle' }
function actionBtn(bg: string, color: string): React.CSSProperties {
  return { background: bg, border: 'none', color, padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }
}
