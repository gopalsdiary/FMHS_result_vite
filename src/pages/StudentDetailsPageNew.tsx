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

export default function StudentDetailsPageNew() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Support both standard format (?IID=xxx&examID=yyy) and compact format (?xxx&yyy)
  const getIidAndExamId = () => {
    let parsedIid = searchParams.get('IID') ?? ''
    let parsedExamId = searchParams.get('examID')

    if (!parsedIid) {
      const searchStr = window.location.search.substring(1)
      if (searchStr && !searchStr.includes('=')) {
        const parts = searchStr.split('&')
        if (parts[0]) {
          parsedIid = decodeURIComponent(parts[0])
        }
        if (parts[1]) {
          parsedExamId = decodeURIComponent(parts[1])
        }
      }
    }
    return { iid: parsedIid, examId: parsedExamId }
  }

  const { iid, examId } = getIidAndExamId()
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
    let query = supabase.from('FMHS_exam_data').select('*').eq('iid', iid)
    
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
        const qrUrl = `https://app.fmhs.edu.bd/student-details?${encodeURIComponent(iid)}${examId ? `&${encodeURIComponent(examId)}` : ''}`
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

    element.classList.add('generating-pdf')

    const opt = {
      margin: [5, 5, 5, 5],
      filename: `Result_${(info?.name || 'Student').replace(/\s+/g, '_')}_${info?.iid || ''}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true,
        width: 800 // Force width to match the component's maxWidth for consistent scaling
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: 'avoid-all' }
    }
    setTimeout(() => {
      h2p().from(element).set(opt).save()
        .then(() => {
          element.classList.remove('generating-pdf')
        })
        .catch((err: unknown) => {
          console.error('PDF generation error:', err)
          element.classList.remove('generating-pdf')
        })
    }, 150)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '60px' }}><div className="spinner" /></div>
  if (error) return (
    <div style={{ textAlign: 'center', padding: '60px', color: '#d73a49' }}>
      <p>{error}</p>
      <button className="btn btn-primary" onClick={() => navigate(-1)}>← Back</button>
    </div>
  )

  const classNameClean = String(info?.className || '').trim()
  const isClass6to8 = ['6', '7', '8', 'six', 'seven', 'eight', 'class_6', 'class_7', 'class_8'].some(c => classNameClean.toLowerCase().includes(c))
  const header1 = isClass6to8 ? 'WRITTEN' : 'CQ'
  const header2 = isClass6to8 ? 'CA' : 'MCQ'

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
      <div style={{ fontFamily: "'Inter', sans-serif", background: '#fff', maxWidth: '800px', margin: '0 auto', padding: '30px 40px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', borderRadius: '16px', position: 'relative' }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
          
          .no-print { display: flex; gap: 8px; margin-bottom: 20px; }
          @media print { 
            @page { size: A4; margin: 10mm; }
            .no-print { display:none !important; } 
            body { background: #fff !important; margin: 0; padding: 0; }
            .main-container { 
              box-shadow: none !important; margin: 0 !important; width: 100% !important; 
              max-width: none !important; border-radius: 0 !important; padding: 0 !important;
              border: none !important;
            }
            .summary-bar { border: 1px solid #dbeafe !important; background: #f0f7ff !important; }
            
            /* Print scaling for A4 */
            .exam-title { 
              margin-bottom: 12px !important; font-size: 13px !important; 
              padding: 4px 20px !important;
            }
            .student-name { font-size: 18px !important; margin-bottom: 4px !important; }
            .student-details { margin-bottom: 12px !important; font-size: 12px !important; }
            .marks-table { margin-bottom: 12px !important; }
            .marks-table th, .marks-table td { padding: 8px 6px !important; font-size: 11px !important; }
            .summary-bar { margin-bottom: 15px !important; padding: 8px 10px !important; border-radius: 12px !important; }
            .summary-value { font-size: 14px !important; }
            .qr-section { margin-top: 10px !important; }
            .qr-box img { width: 90px !important; height: 90px !important; }
          }
          
          .header-title { color: #1e3a8a; font-size: 28px; font-weight: 800; text-align: center; margin-bottom: 4px; }
          .header-subtitle { color: #4b5563; font-size: 16px; text-align: center; margin-bottom: 12px; }
          .exam-title { 
            color: #fff; 
            background: #e11d48;
            display: inline-block;
            padding: 6px 30px;
            font-size: 16px; 
            font-weight: 800; 
            text-align: center; 
            margin: 0 auto 16px auto;
            border-radius: 50px;
            text-transform: uppercase;
            letter-spacing: 1px;
            box-shadow: 0 4px 10px rgba(225, 29, 72, 0.2);
          }
          .exam-title-container { text-align: center; }
          
          .student-name { font-size: 22px; font-weight: 900; color: #1e293b; margin-bottom: 6px; text-transform: uppercase; letter-spacing: -0.5px; }
          .student-details { font-size: 13px; color: #475569; line-height: 1.5; margin-bottom: 16px; }
          
          .marks-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 16px; 
            border-radius: 16px; 
            overflow: hidden; 
            border: 1px solid #e2e8f0;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.03);
          }
          .marks-table th { 
            padding: 10px 8px; 
            font-size: 12px; 
            font-weight: 800; 
            color: #fff; 
            text-align: center; 
            background-color: #22c55e; /* Vibrant Green Header */
            text-transform: uppercase;
            border: 1px solid #e2e8f0;
          }
          .marks-table th.subject-col { 
            background-color: #1d82e2; /* Bright Blue Header */
            text-align: left; 
            width: 35%; 
            padding-left: 20px;
          }
          
          .marks-table td { 
            padding: 10px 8px; 
            font-size: 14px; 
            text-align: center; 
            background-color: #fffdf4; /* Creamy yellow background */
            color: #334155;
            border: 1px solid #e2e8f0; /* Light grid borders */
          }
          .marks-table td.subject-name { 
            color: #1d4ed8; /* Indigo/blue subject name */
            font-weight: 800; 
            text-align: left; 
            background-color: #eff6ff; /* Light pastel blue background for subject col */
            padding-left: 20px;
          }
          
          .summary-bar { 
            display: flex; justify-content: space-between; 
            background-color: #f0f7ff; padding: 12px 20px; 
            border-radius: 14px; margin-bottom: 20px;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
            border: 1px solid #e0f2fe;
          }
          .summary-item { text-align: center; flex: 1; border-right: 1px solid #bae6fd; }
          .summary-item:last-child { border-right: none; }
          .summary-label { font-size: 10px; font-weight: 800; color: #0369a1; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
          .summary-value { font-size: 16px; font-weight: 900; color: #0f172a; }
          
          .qr-section { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; }
          .qr-box { border: 1px solid #e2e8f0; padding: 8px; display: inline-block; background: #fff; borderRadius: 12px; }
          .qr-text { font-size: 11px; color: #64748b; margin-bottom: 6px; }
          .scan-verify { font-size: 10px; text-align: center; margin-top: 4px; font-weight: 700; color: #475569; text-transform: uppercase; }

          /* PDF generation overrides to fit on one page */
          .generating-pdf {
            box-shadow: none !important;
            margin: 0 auto !important;
            width: 100% !important;
            max-width: 800px !important;
            border-radius: 0 !important;
            padding: 25px 35px !important;
            border: none !important;
          }
          .generating-pdf .no-print {
            display: none !important;
          }
          .generating-pdf .student-name {
            font-size: 20px !important;
            margin-bottom: 6px !important;
          }
          .generating-pdf .student-details {
            margin-bottom: 15px !important;
            font-size: 12.5px !important;
            gap: 8px 24px !important;
            padding-bottom: 10px !important;
          }
          .generating-pdf .marks-table {
            margin-bottom: 15px !important;
          }
          .generating-pdf .marks-table th,
          .generating-pdf .marks-table td {
            padding: 10px 10px !important;
            font-size: 12px !important;
          }
          .generating-pdf .summary-bar {
            margin-bottom: 18px !important;
            padding: 10px 16px !important;
            border-radius: 12px !important;
            border: 1px solid #dbeafe !important;
            background: #f0f7ff !important;
          }
          .generating-pdf .summary-value {
            font-size: 15px !important;
          }
          .generating-pdf .qr-section {
            margin-top: 15px !important;
          }
          .generating-pdf .qr-box img {
            width: 95px !important;
            height: 95px !important;
          }
          .generating-pdf .scan-verify {
            font-size: 10px !important;
          }
          .generating-pdf .qr-text {
            font-size: 11px !important;
          }
        `}</style>

        <div className="no-print">
          <button onClick={() => navigate(-1)} style={{ padding: '10px 20px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>← Back</button>
          <button onClick={() => window.print()} style={{ padding: '10px 20px', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>🖨️ Print Result</button>
          <button onClick={handleDownloadPDF} style={{ padding: '10px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>📥 Download PDF</button>
        </div>

        <div ref={containerRef} className="main-container">
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '12px' }}>
            <img
              src={LETTERHEAD_IMAGE}
              alt=""
              style={{ display: 'block', maxWidth: '100%', width: '100%', height: 'auto', margin: '0 auto' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <div className="exam-title-container">
            <div className="exam-title">{info?.examName || 'Examination Result'}</div>
          </div>

          {/* Student Info */}
          <div className="student-name">{info?.name}</div>
          <div className="student-details" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', borderBottom: '2px dashed #f1f5f9', paddingBottom: '12px' }}>
            <div><span style={{ fontWeight: 700, color: '#64748b' }}>Father's Name:</span> <span style={{ fontWeight: 800, color: '#1e293b' }}>{info?.fatherName || 'N/A'}</span></div>
            <div><span style={{ fontWeight: 700, color: '#64748b' }}>Roll No:</span> <span style={{ fontWeight: 800, color: '#1e293b' }}>{info?.roll}</span></div>
            <div><span style={{ fontWeight: 700, color: '#64748b' }}>Class:</span> <span style={{ fontWeight: 800, color: '#1e293b' }}>{info?.className}</span></div>
            <div><span style={{ fontWeight: 700, color: '#64748b' }}>Section:</span> <span style={{ fontWeight: 800, color: '#1e293b' }}>{info?.section}</span></div>
            <div><span style={{ fontWeight: 700, color: '#64748b' }}>IID / Student ID:</span> <span style={{ fontWeight: 800, color: '#1e293b' }}>{info?.iid}</span></div>
            <div><span style={{ fontWeight: 700, color: '#64748b' }}>Mobile:</span> <span style={{ fontWeight: 800, color: '#1e293b' }}>{info?.mobile || 'N/A'}</span></div>
          </div>

          {/* Table */}
          <table className="marks-table">
            <thead>
              <tr>
                <th className="subject-col">Subject</th>
                <th className="mark-col">{header1}</th>
                <th className="mark-col">{header2}</th>
                <th className="mark-col">Practical</th>
                <th className="mark-col">Total</th>
                <th className="mark-col">GPA</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s, i) => {
                const borderColors = ['#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f97316', '#a855f7', '#14b8a6']
                const leftBorderColor = borderColors[i % borderColors.length]
                return (
                  <tr key={i}>
                    <td className="subject-name" style={{ borderLeft: `5px solid ${leftBorderColor}` }}>{s.subject}</td>
                    <td>{s.cq || '—'}</td>
                    <td>{s.mcq || '—'}</td>
                    <td>{s.practical || '—'}</td>
                    <td style={{ fontWeight: 800, color: '#0f172a' }}>{s.total || '—'}</td>
                    <td style={{ fontWeight: 800, color: s.gpa === 'F' ? '#ef4444' : '#15803d' }}>{s.gpa || '—'}</td>
                  </tr>
                )
              })}
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
              <div className="summary-value" style={{ color: finalGpa === 'F' ? '#ef4444' : '#10b981' }}>{finalGpa === 'F' ? '0' : finalGpa}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Remark</div>
              <div className="summary-value" style={{ color: failCount > 0 ? '#ef4444' : '#10b981' }}>{remark}</div>
            </div>
            <div className="summary-item">
              <div className="summary-label">Rank</div>
              <div className="summary-value">—</div>
            </div>
          </div>

          {/* QR and Footer */}
          <div className="qr-section">
            <div style={{ flex: 1, paddingRight: '40px', fontSize: '11px', color: '#475569', lineHeight: '1.5' }}>
              <div style={{ fontWeight: 800, marginBottom: '6px', color: '#1e293b' }}>নির্দেশনা :</div>
              <p style={{ marginBottom: '6px' }}>
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
                <img ref={qrRef} alt="QR Code" style={{ width: '100px', height: '100px' }} />
              </div>
              <div className="scan-verify">Scan to Verify</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
