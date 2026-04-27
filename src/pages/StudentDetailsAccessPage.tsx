// Public-facing student details access page (no auth required)
import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase } from '@/services/supabaseClient'

const LETTERHEAD_IMAGE = 'https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/tFCNijuby2oapSCgvrQ8/pub/aT4p92D1bGZMP8sh1wZN.png'

interface SubjectRow { subject: string; cq: string; mcq: string; practical: string; total: string; gpa: string }
interface StudentInfo { iid: string; name: string; roll: string; section: string; className: string; fatherName?: string; motherName?: string }

function pickVal(row: Record<string, unknown>, candidates: string[]): string {
  for (const k of candidates) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()]
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

export default function StudentDetailsAccessPage() {
  const [searchParams] = useSearchParams()
  const iid = searchParams.get('IID') ?? ''
  const [info, setInfo] = useState<StudentInfo | null>(null)
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const qrRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!iid) { setError('No student ID specified'); setLoading(false); return }
    loadStudent()
  }, [iid])

  async function loadStudent() {
    setLoading(true)
    const { data, error: err } = await supabase.from('FMHS_exam_data').select('*').eq('iid', iid).limit(1)
    if (err || !data?.length) { setError(err?.message ?? 'Student not found'); setLoading(false); return }
    const row = data[0] as Record<string, unknown>
    const keys = Object.keys(row)

    setInfo({
      iid: pickVal(row, ['iid', 'IID']),
      name: pickVal(row, ['student_name', 'name']),
      roll: pickVal(row, ['roll']),
      section: pickVal(row, ['section', 'section']),
      className: pickVal(row, ['class', 'class']),
      fatherName: pickVal(row, ['father_name']),
      motherName: pickVal(row, ['mother_name']),
    })

    const smap: Record<string, Record<string, string>> = {}
    keys.forEach(k => {
      const m = k.match(/^(.+?)_(CQ|WRITTEN|MCQ|CA|Practical|Total|GPA)$/i)
      if (m) {
        const base = m[1].replace(/^\*+/, '').trim()
        const comp = m[2].toUpperCase()
        if (!smap[base]) smap[base] = {}
        smap[base][comp] = k
      }
    })

    const subjectRows: SubjectRow[] = []
    for (const [subj, comps] of Object.entries(smap)) {
      const total = comps.TOTAL ? String(row[comps.TOTAL] ?? '') : ''
      const gpa = comps.GPA ? String(row[comps.GPA] ?? '') : ''
      if (!total && !gpa) continue
      subjectRows.push({
        subject: subj,
        cq: comps.CQ ? String(row[comps.CQ] ?? '') : (comps.WRITTEN ? String(row[comps.WRITTEN] ?? '') : ''),
        mcq: comps.MCQ ? String(row[comps.MCQ] ?? '') : '',
        practical: comps.PRACTICAL ? String(row[comps.PRACTICAL] ?? '') : (comps.CA ? String(row[comps.CA] ?? '') : ''),
        total, gpa,
      })
    }
    setSubjects(subjectRows)

    try {
      const dataUrl = await QRCode.toDataURL(window.location.href, { width: 150, margin: 1 })
      if (qrRef.current) qrRef.current.src = dataUrl
    } catch { /* ignore */ }

    setLoading(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '60px', fontFamily: 'Arial' }}><p>Loading...</p></div>
  if (error) return <div style={{ textAlign: 'center', padding: '60px', color: '#d32f2f', fontFamily: 'Arial' }}><p>{error}</p><p><a href="https://modelresult.netlify.app">Search Result</a></p></div>

  const gpas = subjects.map(s => s.gpa).filter(g => g && g !== '')
  const hasF = gpas.includes('F')
  const nums = gpas.filter(g => g !== 'F' && !isNaN(Number(g))).map(Number)
  const finalGpa = hasF ? 'F' : nums.length > 0 ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2) : '—'

  return (
    <div style={{ fontFamily: "'Times New Roman', serif", background: '#fff', maxWidth: '850px', margin: '20px auto', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', borderRadius: '8px' }}>
      <style>{`@media print { .no-print { display:none !important; } }`}</style>

      <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '16px', justifyContent: 'center' }}>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', background: '#2196F3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🖨️ Print Result</button>
        <a href="https://modelresult.netlify.app" target="_blank" rel="noopener" style={{ padding: '8px 16px', background: '#4caf50', color: '#fff', textDecoration: 'none', borderRadius: '4px' }}>Search Result</a>
      </div>

      <div style={{ textAlign: 'center', borderBottom: '3px double #000', paddingBottom: '12px', marginBottom: '16px' }}>
        <img
          src={LETTERHEAD_IMAGE}
          alt=""
          style={{ display: 'block', maxWidth: '100%', width: '100%', height: 'auto', margin: '0 auto' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <div style={{ fontSize: '22px', fontWeight: 'bold' }}>Feni Model High School</div>
        <div style={{ fontSize: '14px', color: '#444' }}>Annual Examination — 2025</div>
        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#d32f2f', textDecoration: 'underline', marginTop: '8px' }}>RESULT MARKSHEET</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', gap: '16px' }}>
        <table style={{ fontSize: '14px', flex: 1 }}>
          <tbody>
            <tr><td style={{ fontWeight: 'bold', paddingRight: '8px' }}>Student Name</td><td>: {info?.name}</td></tr>
            <tr><td style={{ fontWeight: 'bold' }}>Father's Name</td><td>: {info?.fatherName ?? '—'}</td></tr>
            <tr><td style={{ fontWeight: 'bold' }}>IID</td><td>: {info?.iid}</td></tr>
            <tr><td style={{ fontWeight: 'bold' }}>Roll</td><td>: {info?.roll}</td></tr>
            <tr><td style={{ fontWeight: 'bold' }}>Class / Section</td><td>: {info?.className} / {info?.section}</td></tr>
          </tbody>
        </table>
        <div style={{ textAlign: 'center' }}>
          <img ref={qrRef} alt="QR" style={{ width: '120px', height: '120px', border: '1px solid #333' }} />
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '16px' }}>
        <thead>
          <tr style={{ background: 'linear-gradient(135deg,#4CAF50,#45a049)', color: '#fff' }}>
            <th style={{ padding: '10px 8px', border: '1px solid #aaa', textAlign: 'left' }}>Subject</th>
            <th style={{ padding: '10px 8px', border: '1px solid #aaa', textAlign: 'center' }}>Written</th>
            <th style={{ padding: '10px 8px', border: '1px solid #aaa', textAlign: 'center' }}>MCQ</th>
            <th style={{ padding: '10px 8px', border: '1px solid #aaa', textAlign: 'center' }}>Practical</th>
            <th style={{ padding: '10px 8px', border: '1px solid #aaa', textAlign: 'center' }}>Total</th>
            <th style={{ padding: '10px 8px', border: '1px solid #aaa', textAlign: 'center' }}>GPA</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : 'rgba(255,255,0,0.07)' }}>
              <td style={{ padding: '9px 8px', border: '1px solid #e0e0e0', fontWeight: 'bold', color: '#1976D2', borderLeft: `4px solid hsl(${i * 25},70%,50%)` }}>{s.subject}</td>
              <td style={{ padding: '9px 8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>{s.cq || '—'}</td>
              <td style={{ padding: '9px 8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>{s.mcq || '—'}</td>
              <td style={{ padding: '9px 8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>{s.practical || '—'}</td>
              <td style={{ padding: '9px 8px', border: '1px solid #e0e0e0', textAlign: 'center', fontWeight: 600 }}>{s.total || '—'}</td>
              <td style={{ padding: '9px 8px', border: '1px solid #e0e0e0', textAlign: 'center', fontWeight: 700, color: s.gpa === 'F' ? '#d32f2f' : '#1a7f37' }}>{s.gpa || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #dee2e6' }}>
        <div style={{ fontSize: '18px' }}><strong>GPA: </strong><span style={{ fontWeight: 800, fontSize: '22px', color: hasF ? '#d32f2f' : '#1a7f37' }}>{finalGpa}</span></div>
        <div style={{ fontSize: '16px' }}><strong>Result: </strong><span style={{ fontWeight: 700, color: hasF ? '#d32f2f' : '#1a7f37' }}>{hasF ? 'FAIL' : 'PASS'}</span></div>
      </div>
    </div>
  )
}

