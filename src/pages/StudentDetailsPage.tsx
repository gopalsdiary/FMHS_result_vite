import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase } from '@/services/supabaseClient'

const LETTERHEAD_IMAGE = 'https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/tFCNijuby2oapSCgvrQ8/pub/aT4p92D1bGZMP8sh1wZN.png'

interface SubjectRow { subject: string; cq: string; mcq: string; practical: string; total: string; gpa: string }
interface StudentInfo {
  iid: string
  name: string
  roll: string
  section: string
  className: string
  fatherName?: string
  motherName?: string
  mobile?: string
}

function pickVal(row: Record<string, unknown>, candidates: string[]): string {
  for (const k of candidates) {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()]
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

export default function StudentDetailsPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
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
    const { data, error: err } = await supabase.from('exam_ann25').select('*').eq('iid', iid).limit(1)
    if (err || !data?.length) { setError(err?.message ?? 'Student not found'); setLoading(false); return }
    const row = data[0] as Record<string, unknown>
    const keys = Object.keys(row)

    const studentInfo: StudentInfo = {
      iid: pickVal(row, ['iid', 'IID']),
      name: pickVal(row, ['student_name_en', 'student_name', 'name', 'Name']),
      roll: pickVal(row, ['roll_2025', 'roll', 'Roll']),
      section: pickVal(row, ['section_2025', 'section', 'Section']),
      className: pickVal(row, ['class_2025', 'class', 'Class']),
      fatherName: pickVal(row, ['father_name_en', 'father_name', 'fatherName']),
      motherName: pickVal(row, ['mother_name_en', 'mother_name', 'motherName']),
      mobile: pickVal(row, ['father_mobile', 'mobile', 'Mobile', 'phone']),
    }
    setInfo(studentInfo)

    const smap: Record<string, Record<string, string>> = {}
    keys.forEach(k => {
      const m = k.match(/^\*?(.+?)_(CQ|WRITTEN|MCQ|CA|Practical|Total|GPA)$/i)
      if (m) {
        const base = m[1].trim()
        const comp = m[2].toUpperCase()
        if (!smap[base]) smap[base] = {}
        smap[base][comp] = k
      }
    })

    const subjectRows: SubjectRow[] = []
    for (const [subj, comps] of Object.entries(smap)) {
      const total = comps.TOTAL ? String(row[comps.TOTAL] ?? '') : ''
      const gpa = comps.GPA ? String(row[comps.GPA] ?? '') : ''
      if (!total && !gpa && !comps.CQ) continue
      const cqCol = comps.CQ ?? comps.WRITTEN ?? ''
      const cq = cqCol ? String(row[cqCol] ?? '') : ''
      const mcq = comps.MCQ ? String(row[comps.MCQ] ?? '') : ''
      const practical = comps.PRACTICAL ? String(row[comps.PRACTICAL] ?? '') : (comps.CA ? String(row[comps.CA] ?? '') : '')
      if (!cq && !mcq && !practical && !total && !gpa) continue
      subjectRows.push({ subject: subj, cq, mcq, practical, total, gpa })
    }
    setSubjects(subjectRows)

    try {
      const qrUrl = `${window.location.origin}/student-details?IID=${encodeURIComponent(iid)}`
      const dataUrl = await QRCode.toDataURL(qrUrl, { width: 150, margin: 1 })
      if (qrRef.current) qrRef.current.src = dataUrl
    } catch { /* ignore qr errors */ }

    setLoading(false)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '60px' }}><div className="spinner" /></div>
  if (error) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#d73a49' }}>
      <p>{error}</p>
      <button className="btn btn-primary" onClick={() => navigate(-1)}>← Back</button>
    </div>
  )

  const gpas = subjects.map(s => s.gpa).filter(g => g && g !== '' && g !== '—')
  const hasF = gpas.includes('F')
  const numericGpas = gpas.filter(g => g !== 'F' && !isNaN(Number(g))).map(Number)
  const finalGpa = hasF ? 'F' : numericGpas.length > 0 ? (numericGpas.reduce((a, b) => a + b, 0) / numericGpas.length).toFixed(2) : '—'

  return (
    <div style={{ fontFamily: "'Times New Roman', serif", background: '#fff', maxWidth: '850px', margin: '20px auto', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', borderRadius: '8px' }}>
      <style>{`
        .no-print { display: block; }
        @media print { .no-print { display:none !important; } body { margin:0; } }
        .report-title { font-size: 1.5em; font-weight: bold; color: #d32f2f; text-align: center; margin: 15px 0; text-decoration: underline; }
        .table-wrapper { overflow-x: auto; }
        .marksheet-table {
          background: linear-gradient(135deg, #f8f9fa, #ffffff);
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 8px 25px rgba(0,0,0,0.1);
          border: 2px solid #000000;
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
        }
        .marksheet-table th {
          background: linear-gradient(135deg, #4CAF50, #45a049);
          color: white;
          font-weight: bold;
          text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
          border: none;
          padding: 12px 8px;
        }
        .marksheet-table th:first-child { background: linear-gradient(135deg, #2196F3, #1976D2); }
        .marksheet-table td {
          border: 1px solid #e0e0e0;
          padding: 10px 8px;
          background: #ffffff;
          transition: all 0.3s ease;
        }
        .marksheet-table td:first-child {
          background: linear-gradient(135deg, #e3f2fd, #f8f9fa);
          font-weight: bold;
          color: #1976D2;
          border-left: 4px solid #2196F3;
          white-space: normal;
          word-break: break-word;
          overflow-wrap: anywhere;
        }
        .marksheet-table tr:nth-child(odd) td { background: #ffffff; }
        .marksheet-table tr:nth-child(odd) td:first-child { background: linear-gradient(135deg, #e3f2fd, #f8f9fa); }
        .marksheet-table tr:nth-child(even) td { background: rgba(255, 255, 0, 0.1); }
        .marksheet-table tr:nth-child(even) td:first-child { background: linear-gradient(135deg, #fffde7, #fff9c4); }
        .marksheet-table tr:hover td { background: linear-gradient(135deg, #fff3e0, #ffeaa7); transform: scale(1.02); box-shadow: 0 4px 15px rgba(255, 193, 7, 0.3); }
        .marksheet-table tr:hover td:first-child { background: linear-gradient(135deg, #e1f5fe, #b3e5fc); border-left-color: #0277BD; }
        .bottom-qr img { width: 150px; height: 150px; border: 1px solid #333; padding: 3px; background: white; }
        @media print {
          .bottom-qr { display: block !important; }
          .bottom-qr img { width: 180px; height: 180px; }
          .marksheet-table tr:hover td { transform: none; box-shadow: none; }
        }
      `}</style>

      <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => navigate(-1)} style={{ padding: '8px 16px', background: '#6a737d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>← Back</button>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', background: '#0366d6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>🖨️ Print Result</button>
        <a href="https://modelresult.netlify.app" target="_blank" rel="noopener noreferrer" style={{ padding: '8px 16px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Search Result</a>
      </div>

      <div style={{ textAlign: 'center', borderBottom: '3px double #000', paddingBottom: '12px', marginBottom: '16px' }}>
        <img
          src={LETTERHEAD_IMAGE}
          alt=""
          style={{ display: 'block', maxWidth: '100%', width: '100%', height: 'auto', margin: '0 auto 4px' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <div style={{ fontSize: '14px', color: '#444' }}>Annual Examination — 2025</div>
        <div className="report-title">RESULT MARKSHEET</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', gap: '16px', alignItems: 'flex-start' }}>
        <table style={{ fontSize: '14px', flex: 1 }}>
          <tbody>
            <tr><td style={{ paddingRight: '8px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Student Name</td><td>: {info?.name}</td></tr>
            <tr><td style={{ fontWeight: 'bold' }}>Father's Name</td><td>: {info?.fatherName ?? '—'}</td></tr>
            <tr><td style={{ fontWeight: 'bold' }}>IID</td><td>: {info?.iid}</td></tr>
            <tr><td style={{ fontWeight: 'bold' }}>Roll</td><td>: {info?.roll}</td></tr>
            <tr><td style={{ fontWeight: 'bold' }}>Class / Section</td><td>: {info?.className} / {info?.section}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="table-wrapper">
        <table className="marksheet-table" style={{ marginBottom: '16px', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: 'linear-gradient(135deg, #4CAF50, #45a049)', color: '#fff' }}>
              <th style={{ padding: '10px 8px', border: '1px solid #aaa', textAlign: 'left' }}>Subject</th>
              <th style={{ padding: '10px 8px', border: '1px solid #aaa', textAlign: 'center' }}>Written/CQ</th>
              <th style={{ padding: '10px 8px', border: '1px solid #aaa', textAlign: 'center' }}>MCQ</th>
              <th style={{ padding: '10px 8px', border: '1px solid #aaa', textAlign: 'center' }}>Practical</th>
              <th style={{ padding: '10px 8px', border: '1px solid #aaa', textAlign: 'center' }}>Total</th>
              <th style={{ padding: '10px 8px', border: '1px solid #aaa', textAlign: 'center' }}>GPA</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : 'rgba(255,255,0,0.07)' }}>
                <td style={{ padding: '9px 8px', border: '1px solid #e0e0e0', fontWeight: 'bold', color: '#1976D2', borderLeft: `4px solid hsl(${i * 25}, 70%, 50%)` }}>{s.subject}</td>
                <td style={{ padding: '9px 8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>{s.cq || '—'}</td>
                <td style={{ padding: '9px 8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>{s.mcq || '—'}</td>
                <td style={{ padding: '9px 8px', border: '1px solid #e0e0e0', textAlign: 'center' }}>{s.practical || '—'}</td>
                <td style={{ padding: '9px 8px', border: '1px solid #e0e0e0', textAlign: 'center', fontWeight: 600 }}>{s.total || '—'}</td>
                <td style={{ padding: '9px 8px', border: '1px solid #e0e0e0', textAlign: 'center', fontWeight: 700, color: s.gpa === 'F' ? '#d32f2f' : '#1a7f37' }}>{s.gpa || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginTop: '16px', padding: '16px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #dee2e6' }}>
        <div style={{ fontSize: '18px' }}>
          <strong>GPA: </strong>
          <span style={{ fontWeight: 800, fontSize: '22px', color: hasF ? '#d32f2f' : '#1a7f37' }}>{finalGpa}</span>
        </div>
        <div style={{ fontSize: '16px' }}>
          <strong>Result: </strong>
          <span style={{ fontWeight: 700, color: hasF ? '#d32f2f' : '#1a7f37' }}>{hasF ? 'FAIL' : 'PASS'}</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', fontSize: '13px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #000', width: '120px', paddingTop: '4px' }}>Class Teacher</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #000', width: '120px', paddingTop: '4px' }}>Principal</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '20px', gap: '16px' }}>
        <div style={{ flex: 1, paddingRight: '20px' }}>
          <p style={{ marginTop: '20px', fontWeight: 'bold' }}>
            {info?.roll ? `Roll: ${info.roll} | ` : ''}
            {info?.section ? `Section: ${info.section} | ` : ''}
            {info?.iid ? `IID: ${info.iid}` : ''}
          </p>
          <p style={{ marginTop: '5px', fontWeight: 'normal', textAlign: 'left', fontSize: '0.8em' }}>নির্দেশনা :</p>
          <p style={{ marginTop: '0px', fontWeight: 'normal', textAlign: 'left', fontSize: '0.8em' }}>
            নতুন শিক্ষাবর্ষে জানুয়ারির ১ম সপ্তাহে নতুন শ্রেণিতে ভর্তি হয়ে নতুন বই সংগ্রহ করতে হবে।
            ভর্তির সময় মার্কশীটের ফটোকপি অবশ্যই আনতে হবে।
          </p>
          <p style={{ marginTop: '0px', fontWeight: 'normal', textAlign: 'left', fontSize: '0.8em' }}>
            গ্রহণযোগ্য কারণ উল্লেখ করে প্রয়োজনীয় ক্ষেত্রে অগ্রিম ছুটি নিতে হবে। পূর্বানুমতি ছাড়া এক
            টানা ১০ দিন ক্লাসে অনুপস্থিত থাকলে হাজিরা বহিতে নাম কাটা যাবে।
          </p>
          <p style={{ marginTop: '10px', fontWeight: 'normal', textAlign: 'left', fontSize: '0.8em' }}>
            Verify this result by scanning the QR code.
          </p>
        </div>
        <div className="bottom-qr" style={{ flexShrink: 0, textAlign: 'center' }}>
          <img ref={qrRef} alt="QR Code" />
          <div style={{ fontSize: '8pt', textAlign: 'center', marginTop: '3px' }}>Scan for verify</div>
        </div>
      </div>
    </div>
  )
}
