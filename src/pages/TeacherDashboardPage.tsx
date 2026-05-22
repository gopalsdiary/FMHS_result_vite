import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/services/supabaseClient'
import { handleLogout } from '@/utils/authHelper'

interface Assignment {
  id: number
  subject_code: string
  exam_id: number
  class: number
  section: string
  subject_name: string
  teacher_name_en: string
  final_submitted: boolean
  exams: { exam_name: string; year: number; is_live: boolean; teacher_entry_enabled: boolean }
}

export default function TeacherDashboardPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'locked'>('all')
  const [userEmail, setUserEmail] = useState('')
  const [teacherName, setTeacherName] = useState('')

  useEffect(() => {
    loadAssignments()
  }, [])

  async function loadAssignments() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/login'); return }
    setUserEmail(user.email ?? '')

    const { data: teacherSelections, error: selectionError } = await supabase
      .from('FMHS_exam_teacher_selection')
      .select('*')
      .eq('teacher_email_id', user.email)
      .not('exam_id', 'is', null)
    
    if (selectionError) {
      console.error('Error loading assignments:', selectionError)
      setLoading(false)
      return
    }

    if (!teacherSelections || teacherSelections.length === 0) {
      setAssignments([])
      setLoading(false)
      return
    }

    // Capture teacher name from the selections
    if (teacherSelections[0]?.teacher_name_en) {
      setTeacherName(teacherSelections[0].teacher_name_en)
    }

    // Fetch details of all unique exams referenced by assignments
    const examIds = [...new Set(teacherSelections.map(s => Number(s.exam_id)))]
    const { data: exams, error: examsError } = await supabase
      .from('FMHS_exams_names')
      .select('id, exam_name, year, is_live, teacher_entry_enabled')
      .in('id', examIds)

    if (examsError) {
      console.error('Error loading exam metadata:', examsError)
      setLoading(false)
      return
    }

    // Map exam details onto each assignment in-memory and filter for live exams only
    const mapped = teacherSelections.map(s => {
      const exam = (exams || []).find(e => Number(e.id) === Number(s.exam_id))
      return {
        ...s,
        exams: exam || { exam_name: 'Unknown Exam', year: 0, is_live: false, teacher_entry_enabled: false }
      }
    }).filter(a => a.exams.is_live)

    setAssignments(mapped as any[])
    setLoading(false)
  }

  // Filter assignments based on search query and status filter
  const filteredAssignments = assignments.filter(a => {
    const matchesSearch = 
      a.subject_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.exams.exam_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.class.toString().includes(searchQuery) ||
      a.section.toLowerCase().includes(searchQuery.toLowerCase())

    const isEditable = a.exams.is_live && a.exams.teacher_entry_enabled && !a.final_submitted

    if (statusFilter === 'open') {
      return matchesSearch && isEditable
    }
    if (statusFilter === 'locked') {
      return matchesSearch && !isEditable
    }
    return matchesSearch
  })

  // Compute stats
  const totalCount = assignments.length
  const openCount = assignments.filter(a => a.exams.is_live && a.exams.teacher_entry_enabled && !a.final_submitted).length
  const lockedCount = totalCount - openCount

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#1e293b', fontFamily: "'Outfit', sans-serif" }}>
      
      {/* HEADER */}
      <header style={{ 
        background: 'rgba(255, 255, 255, 0.85)', 
        backdropFilter: 'blur(12px)',
        padding: '12px 20px', 
        borderBottom: '1px solid #edf2f7', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        position: 'sticky', 
        top: 0, 
        zIndex: 100, 
        boxShadow: '0 4px 30px rgba(0,0,0,0.02)' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ 
            width: '34px', 
            height: '34px', 
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', 
            borderRadius: '10px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            color: '#fff', 
            fontWeight: 800,
            fontSize: '1.05rem',
            boxShadow: '0 3px 8px rgba(79, 70, 229, 0.15)'
          }}>T</div>
          <div>
            <h1 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>Teacher Portal</h1>
            <p style={{ margin: 0, fontSize: '8px', color: '#6366f1', fontWeight: 800, letterSpacing: '0.5px' }}>FENI MODEL HIGH SCHOOL</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ textAlign: 'right', display: 'block' }}>
             <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>{teacherName || 'Honorable Teacher'}</div>
             <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 500 }}>{userEmail}</div>
          </div>
          <button onClick={() => handleLogout()} style={{ 
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', 
            border: 'none', 
            color: '#fff', 
            padding: '7px 14px', 
            borderRadius: '8px', 
            cursor: 'pointer', 
            fontWeight: 800, 
            fontSize: '11px',
            letterSpacing: '0.3px',
            transition: 'all 0.2s ease-in-out',
            boxShadow: '0 4px 10px rgba(239, 68, 68, 0.25)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)'
            e.currentTarget.style.boxShadow = '0 6px 14px rgba(239, 68, 68, 0.35)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'none'
            e.currentTarget.style.boxShadow = '0 4px 10px rgba(239, 68, 68, 0.25)'
          }}
          >LOGOUT</button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 16px' }}>
        
        {/* WELCOME BANNER */}
        <div style={{ 
          background: 'linear-gradient(135deg, #1e1b4b 0%, #311042 100%)', 
          borderRadius: '16px', 
          padding: '16px 20px', 
          color: '#fff', 
          marginBottom: '20px',
          boxShadow: '0 6px 20px rgba(30, 27, 75, 0.12)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, letterSpacing: '-0.3px' }}>
              Welcome back, {teacherName || 'Instructor'} 👋
            </h2>
            <p style={{ color: '#c7d2fe', fontSize: '12px', marginTop: '4px', marginBottom: 0, maxWidth: '600px', lineHeight: 1.4 }}>
              Select a class assignment below to enter, review, and finalize academic grades for the current exam session.
            </p>
          </div>
          {/* Subtle design element */}
          <div style={{ 
            position: 'absolute', 
            right: '-30px', 
            bottom: '-30px', 
            width: '130px', 
            height: '130px', 
            borderRadius: '50%', 
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, rgba(99,102,241,0) 70%)',
            zIndex: 1
          }} />
        </div>

        {/* STATS OVERVIEW */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '12px', 
          marginBottom: '20px' 
        }}>
          {/* STAT 1: Total Assignments */}
          <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.01)' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5', fontSize: '1.1rem' }}>📚</div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{totalCount}</div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>Total Assignments</div>
            </div>
          </div>

          {/* STAT 2: Open for Entry */}
          <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.01)' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontSize: '1.1rem' }}>✍️</div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>{openCount}</div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>Open for Mark Entry</div>
            </div>
          </div>

          {/* STAT 3: Submitted & Locked */}
          <div style={{ background: '#fff', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.01)' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7', fontSize: '1.1rem' }}>🔒</div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#a855f7', lineHeight: 1 }}>{lockedCount}</div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, marginTop: '2px' }}>Submitted & Locked</div>
            </div>
          </div>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div style={{ 
          background: '#fff', 
          padding: '10px 14px', 
          borderRadius: '12px', 
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.01)'
        }}>
          {/* SEARCH */}
          <div style={{ position: 'relative', flex: '1 1 260px' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '12px' }}>🔍</span>
            <input 
              type="text" 
              placeholder="Search by subject name, class, section..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 12px 7px 32px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                outline: 'none',
                transition: 'border-color 0.2s',
                fontFamily: 'inherit'
              }}
              onFocus={e => e.target.style.borderColor = '#6366f1'}
              onBlur={e => e.target.style.borderColor = '#cbd5e1'}
            />
          </div>

          {/* FILTERS */}
          <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
            <button 
              onClick={() => setStatusFilter('all')}
              style={{
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: statusFilter === 'all' ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' : 'transparent',
                color: statusFilter === 'all' ? '#fff' : '#64748b',
                boxShadow: statusFilter === 'all' ? '0 4px 8px rgba(79, 70, 229, 0.25)' : 'none',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={e => {
                if (statusFilter !== 'all') e.currentTarget.style.color = '#0f172a'
              }}
              onMouseLeave={e => {
                if (statusFilter !== 'all') e.currentTarget.style.color = '#64748b'
              }}
            >
              All ({totalCount})
            </button>
            <button 
              onClick={() => setStatusFilter('open')}
              style={{
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: statusFilter === 'open' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
                color: statusFilter === 'open' ? '#fff' : '#64748b',
                boxShadow: statusFilter === 'open' ? '0 4px 8px rgba(16, 185, 129, 0.25)' : 'none',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={e => {
                if (statusFilter !== 'open') e.currentTarget.style.color = '#0f172a'
              }}
              onMouseLeave={e => {
                if (statusFilter !== 'open') e.currentTarget.style.color = '#64748b'
              }}
            >
              Open ({openCount})
            </button>
            <button 
              onClick={() => setStatusFilter('locked')}
              style={{
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: statusFilter === 'locked' ? 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)' : 'transparent',
                color: statusFilter === 'locked' ? '#fff' : '#64748b',
                boxShadow: statusFilter === 'locked' ? '0 4px 8px rgba(168, 85, 247, 0.25)' : 'none',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={e => {
                if (statusFilter !== 'locked') e.currentTarget.style.color = '#0f172a'
              }}
              onMouseLeave={e => {
                if (statusFilter !== 'locked') e.currentTarget.style.color = '#64748b'
              }}
            >
              Locked ({lockedCount})
            </button>
          </div>
        </div>

        {/* ASSIGNMENTS GRID */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
          gap: '16px' 
        }}>
          {filteredAssignments.map(a => {
            const isEditable = a.exams.is_live && a.exams.teacher_entry_enabled && !a.final_submitted

            // Compute status properties for visual markers
            let statusLabel = 'Locked'
            let statusBg = '#faf5ff'
            let statusColor = '#9333ea'
            let statusIcon = '🔒'

            if (isEditable) {
              statusLabel = 'Entry Open'
              statusBg = '#ecfdf5'
              statusColor = '#059669'
              statusIcon = '✍️'
            } else if (!a.exams.is_live || !a.exams.teacher_entry_enabled) {
              statusLabel = 'Admin Paused'
              statusBg = '#fff7ed'
              statusColor = '#ea580c'
              statusIcon = '🚫'
            }

            return (
              <Link 
                key={a.id} 
                to={`/teacher-entry/${a.exam_id}/${a.subject_code}`} 
                style={{ textDecoration: 'none', display: 'block', height: '100%' }}
              >
                <div style={{ 
                  background: '#fff', 
                  border: '1.5px solid #f97316', 
                  borderRadius: '14px', 
                  padding: '16px 18px',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.25s ease-in-out', 
                  position: 'relative', 
                  overflow: 'hidden', 
                  boxShadow: '0 2px 10px rgba(0,0,0,0.01)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.borderColor = '#ea580c'
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(249, 115, 22, 0.08)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.borderColor = '#f97316'
                  e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.01)'
                }}
                >
                  {/* Top status indicator and Session Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                     <span style={{ 
                       padding: '3px 8px', 
                       background: '#f1f5f9', 
                       color: '#475569', 
                       borderRadius: '6px', 
                       fontSize: '10px', 
                       fontWeight: 800 
                     }}>
                       {a.exams.year} Session
                     </span>
                     <div style={{ 
                       display: 'flex', 
                       alignItems: 'center', 
                       gap: '4px', 
                       padding: '3px 8px', 
                       background: statusBg, 
                       color: statusColor, 
                       borderRadius: '6px', 
                       fontSize: '10px', 
                       fontWeight: 800 
                     }}>
                        <span>{statusIcon}</span>
                        <span>{statusLabel}</span>
                     </div>
                  </div>

                  {/* Subject and Exam Details */}
                  <div style={{ flexGrow: 1 }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>
                      {a.exams.exam_name}
                    </h3>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#4f46e5', marginBottom: '12px' }}>
                      {a.subject_name}
                    </div>
                  </div>

                  {/* Class and Section Info cards */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <div style={{ flex: 1, background: '#f8fafc', padding: '6px', borderRadius: '8px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.2px' }}>CLASS</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginTop: '1px' }}>{a.class}</div>
                    </div>
                    <div style={{ flex: 1, background: '#f8fafc', padding: '6px', borderRadius: '8px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.2px' }}>SECTION</div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginTop: '1px' }}>{a.section}</div>
                    </div>
                  </div>

                  {/* Interactive Action Indicator */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    paddingTop: '10px', 
                    borderTop: '1px solid #f1f5f9' 
                  }}>
                     <span style={{ 
                       fontSize: '12px', 
                       fontWeight: 800, 
                       color: isEditable ? '#4f46e5' : '#64748b',
                       display: 'flex',
                       alignItems: 'center',
                       gap: '4px'
                     }}>
                       {isEditable ? 'Enter Grades →' : 'View Grades →'}
                     </span>
                     <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Code: {a.subject_code}</span>
                  </div>

                </div>
              </Link>
            )
          })}

          {filteredAssignments.length === 0 && (
            <div style={{ 
              gridColumn: '1 / -1', 
              textAlign: 'center', 
              padding: '40px 16px', 
              background: '#fff', 
              borderRadius: '14px', 
              border: '2px dashed #cbd5e1' 
            }}>
               <div style={{ fontSize: '30px', marginBottom: '12px' }}>🔍</div>
               <h3 style={{ color: '#0f172a', fontWeight: 800, margin: '0 0 6px 0', fontSize: '14px' }}>No matching assignments found</h3>
               <p style={{ color: '#64748b', margin: 0, fontSize: '12px' }}>
                 {assignments.length === 0 
                   ? 'No classes have been assigned to your account yet.' 
                   : 'Try adjusting your search terms or filter selections.'}
               </p>
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
