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
  examName?: string
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
  const examId = searchParams.get('examID')
  const [info, setInfo] = useState<StudentInfo | null>(null)
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const qrRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!iid) { setError('No student ID specified'); setLoading(false); return }
    loadStudent()
  }, [iid, examId])

  async function loadStudent() {
    setLoading(true)
    let query = supabase.from('fmhs_exam_data').select('*').eq('iid', iid)
    
    if (examId) {
      query = query.eq('exam_id', examId)
    }

    const { data, error: err } = await query.limit(1)
    if (err || !data?.length) { setError(err?.message ?? 'Student not found'); setLoading(false); return }
    const row = data[0] as Record<string, unknown>
    const keys = Object.keys(row)

    const studentInfo: StudentInfo = {
      iid: pickVal(row, ['iid', 'IID']),
      name: pickVal(row, ['student_name_en', 'student_name', 'name', 'Name']),
      roll: pickVal(row, ['roll', 'roll', 'Roll']),
      section: pickVal(row, ['section', 'section', 'Section']),
      className: pickVal(row, ['class', 'class', 'Class']),
      fatherName: pickVal(row, ['father_name_en', 'father_name', 'fatherName']),
      motherName: pickVal(row, ['mother_name_en', 'mother_name', 'motherName']),
      mobile: pickVal(row, ['father_mobile', 'mobile', 'Mobile', 'phone']),
      examName: pickVal(row, ['exam_name_year', 'exam_name_en', 'exam_name', 'examName', 'Exam_Name', 'EXAM_NAME']),
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

    setLoading(false)
  }

  useEffect(() => {
    if (!info || !qrRef.current) return
    const generateQR = async () => {
      try {
        const qrUrl = `${window.location.origin}/student-details?IID=${encodeURIComponent(iid)}${examId ? `&examID=${examId}` : ''}`
        const dataUrl = await QRCode.toDataURL(qrUrl, { width: 150, margin: 1 })
        if (qrRef.current) qrRef.current.src = dataUrl
      } catch (err) {
        console.error('QR generation error:', err)
      }
    }
    generateQR()
  }, [info, iid])

  const handleDownloadPDF = () => {
    // Direct script injection to avoid white screen
    const existingScript = document.getElementById('html2pdf-script')
    if (!existingScript) {
      const script = document.createElement('script')
      script.id = 'html2pdf-script'
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
      script.onload = () => runPDF()
      document.body.appendChild(script)
    } else {
      runPDF()
    }
  }

  const runPDF = () => {
    const element = containerRef.current
    if (!element) return
    // @ts-ignore
    const h2p = window.html2pdf
    if (!h2p) return

    const opt = {
      margin: [5, 5, 5, 5],
      filename: `Result_${(info?.name || 'Student').replace(/\s+/g, '_')}_${info?.iid || ''}.pdf`,
      image: { type: 'jpeg', quality: 1 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true,
        width: 800 // Force width to match the component's maxWidth for consistent scaling
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }
    h2p().from(element).set(opt).save()
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

  const totalMark = subjects.reduce((sum, s) => sum + (Number(s.total) || 0), 0)
  const avgMark = subjects.length > 0 ? (totalMark / subjects.length).toFixed(0) : '0'
  const failCount = subjects.filter(s => s.gpa === 'F').length
  const remark = failCount > 0 ? `fail: ${failCount}` : 'Pass'

  return (
    <div style={{ background: '#f0f2f5', minHeight: '100vh', padding: '20px 10px' }}>
      <div style={{ fontFamily: "'Inter', sans-serif", background: '#fff', maxWidth: '800px', margin: '0 auto', padding: '40px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', borderRadius: '12px', position: 'relative' }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
          
          .no-print { display: flex; gap: 8px; margin-bottom: 24px; }
          @media print { 
            @page { size: A4; margin: 10mm; }
            .no-print { display:none !important; } 
            body { background: #fff !important; margin: 0; padding: 0; }
            .main-container { 
              box-shadow: none !important; margin: 0 !important; width: 100% !important; 
              max-width: none !important; border-radius: 0 !important; padding: 0 !important;
              border: none !important;
            }
            .summary-bar { border: 1px solid #000 !important; background: #f9fafb !important; }
            .summary-item { border-right: 1px solid #000 !important; }
            .summary-item:last-child { border-right: none !important; }
            
            /* Print scaling for A4 */
            .exam-title { 
              margin-bottom: 15px !important; font-size: 14px !important; 
              padding: 4px 20px !important;
              color: #dc2626 !important; background: transparent !important;
              border: 1px solid #dc2626 !important;
            }
            .student-name { font-size: 20px !important; margin-bottom: 4px !important; }
            .student-details { margin-bottom: 15px !important; font-size: 13px !important; }
            .marks-table { margin-bottom: 15px !important; border: 1px solid #000 !important; }
            .marks-table th, .marks-table td { padding: 5px 8px !important; font-size: 12px !important; border: 1px solid #000 !important; }
            .summary-bar { margin-bottom: 20px !important; padding: 8px 10px !important; border-radius: 4px !important; }
            .summary-value { font-size: 15px !important; }
            .qr-section { margin-top: 10px !important; }
            .qr-box img { width: 90px !important; height: 90px !important; }
          }
          
          .header-title { color: #1e3a8a; font-size: 28px; font-weight: 800; text-align: center; margin-bottom: 4px; }
          .header-subtitle { color: #4b5563; font-size: 16px; text-align: center; margin-bottom: 12px; }
          .exam-title { 
            color: #fff; 
            background: #dc2626;
            display: inline-block;
            padding: 6px 30px;
            font-size: 18px; 
            font-weight: 700; 
            text-align: center; 
            margin: 0 auto 30px auto;
            border-radius: 50px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .exam-title-container { text-align: center; }
          
          .student-name { font-size: 24px; font-weight: 800; color: #111827; margin-bottom: 8px; text-transform: uppercase; }
          .student-details { font-size: 15px; color: #374151; line-height: 1.5; margin-bottom: 30px; }
          
          .marks-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; }
          .marks-table th { padding: 12px; font-size: 14px; font-weight: 700; color: #fff; text-align: center; background-color: #10b981; }
          .marks-table th.subject-col { background-color: #2563eb; text-align: left; width: 35%; }
          
          .marks-table td { padding: 12px; border-bottom: 1px solid #f3f4f6; font-size: 15px; text-align: center; }
          .marks-table td.subject-name { color: #2563eb; font-weight: 700; text-align: left; }
          
          .summary-bar { 
            display: flex; justify-content: space-between; 
            background-color: #f0f7ff; padding: 15px 25px; 
            border-radius: 16px; margin-bottom: 40px;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
          }
          .summary-item { text-align: center; flex: 1; border-right: 1px solid #dbeafe; }
          .summary-item:last-child { border-right: none; }
          .summary-label { font-size: 12px; font-weight: 700; color: #1e3a8a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
          .summary-value { font-size: 18px; font-weight: 800; color: #111827; }
          
          .qr-section { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px; }
          .qr-box { border: 1px solid #000; padding: 10px; display: inline-block; background: #fff; }
          .qr-text { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
          .scan-verify { font-size: 11px; text-align: center; margin-top: 4px; font-weight: 600; }
        `}</style>

        <div className="no-print">
          <button onClick={() => navigate(-1)} style={{ padding: '10px 20px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>← Back</button>
          <button onClick={() => window.print()} style={{ padding: '10px 20px', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>🖨️ Print Result</button>
          <button onClick={handleDownloadPDF} style={{ padding: '10px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>📥 Download PDF</button>
        </div>

        <div ref={containerRef} className="main-container">
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <img
              src={LETTERHEAD_IMAGE}
              alt=""
              style={{ display: 'block', maxWidth: '100%', width: '100%', height: 'auto', margin: '0 auto 4px' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <div className="exam-title-container">
            <div className="exam-title">{info?.examName || 'Examination Result'}</div>
          </div>

          {/* Student Info */}
          <div className="student-name">{info?.name}</div>
          <div className="student-details">
            <div>Father's Name: {info?.fatherName || 'N/A'}</div>
            <div>Roll: {info?.roll} | Class: {info?.className} | Section: {info?.section}</div>
            <div>Mobile Number: {info?.mobile || 'N/A'} | IID: {info?.iid}</div>
          </div>

          {/* Table */}
          <table className="marks-table">
            <thead>
              <tr>
                <th className="subject-col">Subject</th>
                <th className="mark-col">CQ</th>
                <th className="mark-col">MCQ</th>
                <th className="mark-col">Practical</th>
                <th className="mark-col">Total</th>
                <th className="mark-col">GPA</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s, i) => (
                <tr key={i}>
                  <td className="subject-name">{s.subject}</td>
                  <td>{s.cq || '-'}</td>
                  <td>{s.mcq || '-'}</td>
                  <td>{s.practical || '-'}</td>
                  <td style={{ fontWeight: 700 }}>{s.total || '-'}</td>
                  <td style={{ fontWeight: 700 }}>{s.gpa || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary Bar */}
          <div className="summary-bar">
            <div className="summary-item">
              <div className="summary-label">Total Mark</div>
              <div className="summary-value">{totalMark}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Avg Mark</div>
              <div className="summary-value">{avgMark}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">GPA</div>
              <div className="summary-value">{finalGpa === 'F' ? '0' : finalGpa}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Remark</div>
              <div className="summary-value" style={{ color: failCount > 0 ? '#dc2626' : '#10b981' }}>{remark}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Rank</div>
              <div className="summary-value">-</div>
            </div>
          </div>

          {/* QR and Footer */}
          <div className="qr-section">
            <div style={{ flex: 1, paddingRight: '40px', fontSize: '13px', color: '#374151', lineHeight: '1.6' }}>
              <div style={{ fontWeight: 700, marginBottom: '8px' }}>নির্দেশনা :</div>
              <p style={{ marginBottom: '8px' }}>
                নতুন শিক্ষাবর্ষে জানুয়ারির ১ম সপ্তাহে নতুন শ্রেণিতে ভর্তি হয়ে নতুন বই সংগ্রহ করতে হবে। 
                ভর্তির সময় মার্কশীটের ফটোকপি অবশ্যই আনতে হবে।
              </p>
              <p>
                গ্রহণযোগ্য কারণ উল্লেখ করে প্রয়োজনীয় ক্ষেত্রে অগ্রিম ছুটি নিতে হবে। 
                পূর্বানুমতি ছাড়া এক টানা ১০ দিন ক্লাসে অনুপস্থিত থাকলে হাজিরা বহিতে নাম কাটা যাবে।
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="qr-box">
                <img ref={qrRef} alt="QR Code" style={{ width: '120px', height: '120px' }} />
              </div>
              <div className="scan-verify">Scan for verify</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
